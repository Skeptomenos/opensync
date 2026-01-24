/**
 * useUser Hook - Current user data and statistics from Pocketbase
 *
 * Replaces Convex useQuery(api.users.me) and useQuery(api.users.stats)
 *
 * This hook provides:
 * - Current user info from Pocketbase (fetched by auth context ID)
 * - User statistics computed from sessions collection
 * - Mutations for API key, enabled agents, and account deletion
 * - Realtime updates for user data
 *
 * @see ralph-wiggum/specs/POCKETBASE_MIGRATION.md - Migration spec
 * @see convex/users.ts - Original implementation
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { pb } from "../lib/pocketbase";
import { useAuth } from "../lib/auth";
import { Collections, type PocketbaseUser, type Session } from "../lib/types";
import type { UnsubscribeFunc } from "pocketbase";

// ============================================================================
// Types
// ============================================================================

/**
 * User statistics aggregated from sessions.
 * These are computed client-side from the sessions collection.
 */
export interface UserStats {
  /** Total number of sessions */
  sessionCount: number;
  /** Total number of messages across all sessions */
  messageCount: number;
  /** Total tokens used across all sessions */
  totalTokens: number;
  /** Total cost in USD */
  totalCost: number;
  /** Total duration in milliseconds */
  totalDurationMs: number;
  /** Token usage by model */
  modelUsage: Record<string, number>;
  /** Token usage by provider */
  providerUsage: Record<string, number>;
}

/**
 * Result of a delete operation with counts.
 */
export interface DeleteResult {
  deleted: boolean;
  counts: {
    sessions: number;
    messages: number;
    parts: number;
    embeddings: number;
    apiLogs: number;
  };
}

/**
 * Options for useUser hook.
 */
export interface UseUserOptions {
  /** User ID to fetch. If not provided, uses current authenticated user. */
  userId?: string;
  /** Enable realtime updates for user record. */
  realtime?: boolean;
  /** Skip stats computation (faster if only user data needed). */
  skipStats?: boolean;
}

/**
 * Result returned by useUser hook.
 */
export interface UseUserResult {
  // User data
  /** Full Pocketbase user record */
  user: PocketbaseUser | null;
  /** Whether user has an API key */
  hasApiKey: boolean;
  /** List of enabled agent identifiers */
  enabledAgents: string[];
  /** User creation timestamp (epoch ms) */
  createdAt: number | null;

  // Stats
  /** Aggregated user statistics */
  stats: UserStats | null;
  /** Whether stats are still loading */
  statsLoading: boolean;

  // Loading/error states
  /** Whether user data is loading */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;

  // Mutations
  /** Generate a new API key. Returns the key string. */
  generateApiKey: () => Promise<string>;
  /** Revoke the current API key. */
  revokeApiKey: () => Promise<void>;
  /** Update the list of enabled agents. */
  updateEnabledAgents: (agents: string[]) => Promise<void>;
  /** Delete all user data (sessions, messages, parts, apiLogs). */
  deleteAllData: () => Promise<DeleteResult>;
  /** Delete user account and all associated data. */
  deleteAccount: () => Promise<{ deleted: boolean; error?: string }>;

  // Actions
  /** Refetch user data and stats. */
  refetch: () => Promise<void>;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a cryptographically secure API key.
 * Format: os_[32 random hex chars]
 */
function generateSecureApiKey(): string {
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const hex = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `os_${hex}`;
}

/**
 * Compute user stats from sessions array.
 */
function computeStats(sessions: Session[]): UserStats {
  const modelUsage: Record<string, number> = {};
  const providerUsage: Record<string, number> = {};

  let messageCount = 0;
  let totalTokens = 0;
  let totalCost = 0;
  let totalDurationMs = 0;

  for (const session of sessions) {
    messageCount += session.messageCount || 0;
    totalTokens += session.totalTokens || 0;
    totalCost += session.cost || 0;
    totalDurationMs += session.durationMs || 0;

    // Aggregate by model
    if (session.model) {
      modelUsage[session.model] = (modelUsage[session.model] || 0) + (session.totalTokens || 0);
    }

    // Aggregate by provider
    if (session.provider) {
      providerUsage[session.provider] =
        (providerUsage[session.provider] || 0) + (session.totalTokens || 0);
    }
  }

  return {
    sessionCount: sessions.length,
    messageCount,
    totalTokens,
    totalCost,
    totalDurationMs,
    modelUsage,
    providerUsage,
  };
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook to fetch and manage user data and statistics.
 *
 * @example
 * ```tsx
 * const {
 *   user,
 *   hasApiKey,
 *   stats,
 *   isLoading,
 *   generateApiKey,
 *   revokeApiKey,
 * } = useUser();
 *
 * // In Settings page:
 * if (hasApiKey) {
 *   <Button onClick={revokeApiKey}>Revoke API Key</Button>
 * } else {
 *   <Button onClick={generateApiKey}>Generate API Key</Button>
 * }
 * ```
 */
export function useUser(options: UseUserOptions = {}): UseUserResult {
  const { userId: providedUserId, realtime = false, skipStats = false } = options;

  // Get current authenticated user from auth context
  const { user: authUser } = useAuth();

  // Determine which user ID to use
  const userId = providedUserId || authUser?.id;

  // State
  const [user, setUser] = useState<PocketbaseUser | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(!skipStats);
  const [error, setError] = useState<string | null>(null);

  // Refs for subscriptions
  const unsubscribeRef = useRef<UnsubscribeFunc | null>(null);

  // ============================================================================
  // Fetch Functions
  // ============================================================================

  /**
   * Fetch user record from Pocketbase.
   */
  const fetchUser = useCallback(async () => {
    if (!userId) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const record = await pb.collection(Collections.USERS).getOne<PocketbaseUser>(userId);
      setUser(record);
    } catch (err) {
      // 404 means user doesn't exist in PB yet (shouldn't happen after auth sync)
      if ((err as { status?: number })?.status === 404) {
        setUser(null);
      } else {
        const message = err instanceof Error ? err.message : "Failed to fetch user";
        setError(message);
        console.error("[useUser] Error fetching user:", err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  /**
   * Fetch and compute user statistics from sessions.
   */
  const fetchStats = useCallback(async () => {
    if (!userId || skipStats) {
      setStats(null);
      setStatsLoading(false);
      return;
    }

    setStatsLoading(true);

    try {
      // Fetch all sessions for this user (paginated for large datasets)
      // We need all sessions to compute accurate stats
      const allSessions: Session[] = [];
      let page = 1;
      const perPage = 500; // Fetch in batches

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const result = await pb.collection(Collections.SESSIONS).getList<Session>(page, perPage, {
          filter: `user = "${userId}"`,
          fields: "id,messageCount,totalTokens,cost,durationMs,model,provider",
        });

        allSessions.push(...result.items);

        if (result.items.length < perPage) {
          break; // No more pages
        }
        page++;
      }

      setStats(computeStats(allSessions));
    } catch (err) {
      console.error("[useUser] Error computing stats:", err);
      // Don't set error - stats are secondary to user data
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, [userId, skipStats]);

  /**
   * Refetch all data.
   */
  const refetch = useCallback(async () => {
    await Promise.all([fetchUser(), fetchStats()]);
  }, [fetchUser, fetchStats]);

  // ============================================================================
  // Effects
  // ============================================================================

  // Initial fetch
  useEffect(() => {
    fetchUser();
    fetchStats();
  }, [fetchUser, fetchStats]);

  // Realtime subscription for user record
  useEffect(() => {
    if (!realtime || !userId) return;

    const subscribe = async () => {
      try {
        unsubscribeRef.current = await pb
          .collection(Collections.USERS)
          .subscribe<PocketbaseUser>(userId, (e) => {
            if (e.action === "update") {
              setUser(e.record);
            } else if (e.action === "delete") {
              setUser(null);
            }
          });
      } catch (err) {
        console.error("[useUser] Failed to subscribe:", err);
      }
    };

    subscribe();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [realtime, userId]);

  // ============================================================================
  // Mutations
  // ============================================================================

  /**
   * Generate a new API key for the user.
   * Returns the generated key (only shown once).
   */
  const generateApiKey = useCallback(async (): Promise<string> => {
    if (!userId) {
      throw new Error("User not authenticated");
    }

    const apiKey = generateSecureApiKey();
    const apiKeyCreatedAt = Date.now();

    await pb.collection(Collections.USERS).update(userId, {
      apiKey,
      apiKeyCreatedAt,
    });

    // Update local state
    setUser((prev) =>
      prev ? { ...prev, apiKey, apiKeyCreatedAt } : null
    );

    return apiKey;
  }, [userId]);

  /**
   * Revoke the current API key.
   */
  const revokeApiKey = useCallback(async (): Promise<void> => {
    if (!userId) {
      throw new Error("User not authenticated");
    }

    await pb.collection(Collections.USERS).update(userId, {
      apiKey: "",
      apiKeyCreatedAt: 0,
    });

    // Update local state
    setUser((prev) =>
      prev ? { ...prev, apiKey: "", apiKeyCreatedAt: 0 } : null
    );
  }, [userId]);

  /**
   * Update the list of enabled agents.
   */
  const updateEnabledAgents = useCallback(
    async (agents: string[]): Promise<void> => {
      if (!userId) {
        throw new Error("User not authenticated");
      }

      await pb.collection(Collections.USERS).update(userId, {
        enabledAgents: agents,
      });

      // Update local state
      setUser((prev) =>
        prev ? { ...prev, enabledAgents: agents } : null
      );
    },
    [userId]
  );

  /**
   * Delete all user data (sessions, messages, parts, apiLogs).
   * Does NOT delete the user account itself.
   */
  const deleteAllData = useCallback(async (): Promise<DeleteResult> => {
    if (!userId) {
      throw new Error("User not authenticated");
    }

    const counts = {
      sessions: 0,
      messages: 0,
      parts: 0,
      embeddings: 0,
      apiLogs: 0,
    };

    try {
      // 1. Get all sessions for this user
      const sessions = await pb.collection(Collections.SESSIONS).getFullList<Session>({
        filter: `user = "${userId}"`,
        fields: "id",
      });
      counts.sessions = sessions.length;

      // 2. For each session, delete messages and parts
      for (const session of sessions) {
        // Get messages for this session
        const messages = await pb.collection(Collections.MESSAGES).getFullList({
          filter: `session = "${session.id}"`,
          fields: "id",
        });
        counts.messages += messages.length;

        // Delete parts for each message
        for (const message of messages) {
          const parts = await pb.collection(Collections.PARTS).getFullList({
            filter: `message = "${message.id}"`,
            fields: "id",
          });
          counts.parts += parts.length;

          // Delete parts
          for (const part of parts) {
            await pb.collection(Collections.PARTS).delete(part.id);
          }

          // Delete message
          await pb.collection(Collections.MESSAGES).delete(message.id);
        }

        // Delete session
        await pb.collection(Collections.SESSIONS).delete(session.id);
      }

      // 3. Delete API logs
      const apiLogs = await pb.collection(Collections.API_LOGS).getFullList({
        filter: `user = "${userId}"`,
        fields: "id",
      });
      counts.apiLogs = apiLogs.length;

      for (const log of apiLogs) {
        await pb.collection(Collections.API_LOGS).delete(log.id);
      }

      // 4. Embeddings (deferred collections - may not exist yet)
      try {
        const sessionEmbeddings = await pb.collection(Collections.SESSION_EMBEDDINGS).getFullList({
          filter: sessions.map((s) => `session = "${s.id}"`).join(" || ") || "1=0",
          fields: "id",
        });
        counts.embeddings += sessionEmbeddings.length;
        for (const emb of sessionEmbeddings) {
          await pb.collection(Collections.SESSION_EMBEDDINGS).delete(emb.id);
        }
      } catch {
        // Collection may not exist yet - ignore
      }

      // Refresh stats after deletion
      await fetchStats();

      return { deleted: true, counts };
    } catch (err) {
      console.error("[useUser] Error deleting data:", err);
      throw err;
    }
  }, [userId, fetchStats]);

  /**
   * Delete user account and all associated data.
   * This is a destructive operation.
   */
  const deleteAccount = useCallback(async (): Promise<{ deleted: boolean; error?: string }> => {
    if (!userId) {
      return { deleted: false, error: "User not authenticated" };
    }

    try {
      // First delete all user data
      await deleteAllData();

      // Then delete the user record
      await pb.collection(Collections.USERS).delete(userId);

      // Clear local state
      setUser(null);
      setStats(null);

      return { deleted: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete account";
      console.error("[useUser] Error deleting account:", err);
      return { deleted: false, error: message };
    }
  }, [userId, deleteAllData]);

  // ============================================================================
  // Derived Values
  // ============================================================================

  const hasApiKey = Boolean(user?.apiKey);
  const enabledAgents = user?.enabledAgents || [];
  const createdAt = user?.created ? new Date(user.created).getTime() : null;

  // ============================================================================
  // Return
  // ============================================================================

  return {
    // User data
    user,
    hasApiKey,
    enabledAgents,
    createdAt,

    // Stats
    stats,
    statsLoading,

    // Loading/error states
    isLoading,
    error,

    // Mutations
    generateApiKey,
    revokeApiKey,
    updateEnabledAgents,
    deleteAllData,
    deleteAccount,

    // Actions
    refetch,
  };
}

export default useUser;
