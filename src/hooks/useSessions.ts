/**
 * useSessions Hook - List, filter, and paginate sessions from Pocketbase
 *
 * Replaces Convex useQuery(api.analytics.sessionsWithDetails, {...})
 *
 * Features:
 * - Filter by source, model, project, provider
 * - Sort by various fields (updatedAt, createdAt, totalTokens, cost, durationMs)
 * - Pagination support
 * - Realtime updates via Pocketbase subscriptions
 *
 * @see ralph-wiggum/specs/POCKETBASE_MIGRATION.md - Migration spec
 * @see convex/analytics.ts:sessionsWithDetails - Original implementation
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { pb } from "../lib/pocketbase";
import {
  Collections,
  type Session,
  type SessionSource,
} from "../lib/types";
import type { UnsubscribeFunc } from "pocketbase";

// ============================================================================
// Types
// ============================================================================

export type SortField =
  | "updated"
  | "created"
  | "totalTokens"
  | "cost"
  | "durationMs";
export type SortOrder = "asc" | "desc";

export interface UseSessionsOptions {
  /** Maximum number of sessions to return (default: 100) */
  limit?: number;
  /** Page number for pagination (1-based, default: 1) */
  page?: number;
  /** Field to sort by */
  sortBy?: SortField;
  /** Sort order */
  sortOrder?: SortOrder;
  /** Filter by session source (opencode, claude-code) */
  source?: string;
  /** Filter by model name */
  model?: string;
  /** Filter by project name or path */
  project?: string;
  /** Filter by provider */
  provider?: string;
  /** User ID to filter by (required for multi-user mode) */
  userId?: string;
  /** Enable realtime updates */
  realtime?: boolean;
}

export interface UseSessionsResult {
  /** List of sessions */
  sessions: Session[];
  /** Total number of sessions matching filters */
  total: number;
  /** Total pages available */
  totalPages: number;
  /** Current page */
  page: number;
  /** Whether data is loading */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Refetch sessions */
  refetch: () => Promise<void>;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Infer provider from model name when provider field is missing.
 * Mirrors the logic from convex/analytics.ts:inferProvider
 */
export function inferProvider(session: {
  model?: string;
  provider?: string;
}): string {
  if (session.provider) return session.provider;

  const model = (session.model || "").toLowerCase();

  if (model.includes("claude") || model.includes("anthropic")) return "anthropic";
  if (
    model.includes("gpt") ||
    model.includes("o1") ||
    model.includes("o3") ||
    model.includes("davinci") ||
    model.includes("curie") ||
    model.includes("text-embedding")
  )
    return "openai";
  if (model.includes("gemini") || model.includes("palm") || model.includes("bard"))
    return "google";
  if (model.includes("mistral") || model.includes("mixtral")) return "mistral";
  if (model.includes("command") || model.includes("cohere")) return "cohere";
  if (model.includes("llama") || model.includes("meta")) return "meta";
  if (model.includes("deepseek")) return "deepseek";
  if (model.includes("groq")) return "groq";

  return "unknown";
}

/**
 * Build Pocketbase filter expression from options.
 * Pocketbase filter syntax: field = "value" && field ~ "pattern"
 */
function buildFilter(options: UseSessionsOptions): string {
  const conditions: string[] = [];

  // User filter (required in multi-user mode)
  if (options.userId) {
    conditions.push(`user = "${options.userId}"`);
  }

  // Source filter
  if (options.source) {
    // Treat "opencode" as also matching empty/null source for backward compatibility
    if (options.source === "opencode") {
      conditions.push(`(source = "opencode" || source = "" || source = null)`);
    } else {
      conditions.push(`source = "${options.source}"`);
    }
  }

  // Model filter (exact match)
  if (options.model) {
    conditions.push(`model = "${options.model}"`);
  }

  // Project filter (matches projectName or projectPath)
  if (options.project) {
    const escaped = options.project.replace(/"/g, '\\"');
    conditions.push(`(projectName = "${escaped}" || projectPath = "${escaped}")`);
  }

  // Provider filter is handled client-side (needs inferProvider logic)
  // Pocketbase doesn't support complex conditional filtering like inferProvider

  return conditions.join(" && ");
}

/**
 * Build Pocketbase sort expression.
 * Prefix with - for descending order.
 */
function buildSort(sortBy: SortField = "updated", sortOrder: SortOrder = "desc"): string {
  const prefix = sortOrder === "desc" ? "-" : "";
  return `${prefix}${sortBy}`;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook to fetch and manage sessions from Pocketbase.
 *
 * @example
 * ```tsx
 * const { sessions, isLoading, error, refetch } = useSessions({
 *   source: "opencode",
 *   sortBy: "updated",
 *   sortOrder: "desc",
 *   limit: 50,
 *   userId: currentUser?.id,
 * });
 * ```
 */
export function useSessions(options: UseSessionsOptions = {}): UseSessionsResult {
  const {
    limit = 100,
    page = 1,
    sortBy = "updated",
    sortOrder = "desc",
    source,
    model,
    project,
    provider,
    userId,
    realtime = false,
  } = options;

  const [sessions, setSessions] = useState<Session[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track current options to avoid stale closures in subscription
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Unsubscribe function for realtime
  const unsubscribeRef = useRef<UnsubscribeFunc | null>(null);

  const fetchSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const filter = buildFilter({ source, model, project, userId });
      const sort = buildSort(sortBy, sortOrder);

      const result = await pb
        .collection(Collections.SESSIONS)
        .getList<Session>(page, limit, {
          filter: filter || undefined,
          sort,
        });

      let items = result.items;

      // Client-side provider filtering (requires inferProvider logic)
      if (provider) {
        items = items.filter((s) => inferProvider(s) === provider);
      }

      // Apply inferProvider to all sessions for consistent display
      const processedSessions = items.map((s) => ({
        ...s,
        provider: inferProvider(s),
        source: (s.source || "opencode") as SessionSource,
      }));

      setSessions(processedSessions);
      setTotal(result.totalItems);
      setTotalPages(result.totalPages);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch sessions";
      setError(message);
      console.error("useSessions error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [limit, page, sortBy, sortOrder, source, model, project, provider, userId]);

  // Initial fetch and refetch on options change
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Realtime subscription
  useEffect(() => {
    if (!realtime) return;

    // Subscribe to sessions collection
    const subscribe = async () => {
      try {
        unsubscribeRef.current = await pb
          .collection(Collections.SESSIONS)
          .subscribe("*", (e) => {
            // Refetch on any change to keep list consistent
            // This is simpler than trying to merge changes client-side
            if (e.action === "create" || e.action === "update" || e.action === "delete") {
              fetchSessions();
            }
          });
      } catch (err) {
        console.error("Failed to subscribe to sessions:", err);
      }
    };

    subscribe();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [realtime, fetchSessions]);

  return {
    sessions,
    total,
    totalPages,
    page,
    isLoading,
    error,
    refetch: fetchSessions,
  };
}

export default useSessions;
