/**
 * useSearch Hook - Full-text search for sessions and messages from Pocketbase
 *
 * Replaces Convex useQuery(api.search.searchSessionsPaginated, {...})
 * and useQuery(api.search.searchMessagesPaginated, {...})
 *
 * Features:
 * - Search sessions by searchableText field
 * - Search messages by textContent field
 * - Offset-based pagination (cursor)
 * - Session info attached to message results (title, project)
 * - Realtime updates via Pocketbase subscriptions
 *
 * Behavior:
 * - Empty query on sessions: Returns recent sessions (by updated desc)
 * - Empty query on messages: Returns empty array
 *
 * @see ralph-wiggum/specs/POCKETBASE_MIGRATION.md - Migration spec
 * @see convex/search.ts - Original implementation
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { pb } from "../lib/pocketbase";
import {
  Collections,
  type Session,
  type Message,
  type MessageRole,
  type SessionSource,
} from "../lib/types";
import type { UnsubscribeFunc } from "pocketbase";
import { inferProvider } from "./useSessions";

// ============================================================================
// Types
// ============================================================================

export type SearchMode = "sessions" | "messages";

/**
 * Session search result - matches convex/search.ts:searchSessionsPaginated return type
 */
export interface SessionSearchResult {
  id: string;
  externalId: string;
  title?: string;
  projectPath?: string;
  projectName?: string;
  model?: string;
  provider?: string;
  source?: SessionSource;
  totalTokens: number;
  cost: number;
  isPublic: boolean;
  messageCount: number;
  summary?: string;
  createdAt: number; // Unix timestamp (ms)
  updatedAt: number; // Unix timestamp (ms)
}

/**
 * Message search result - matches convex/search.ts:searchMessagesPaginated return type
 * Includes session info for display context
 */
export interface MessageSearchResult {
  id: string;
  sessionId: string;
  externalId: string;
  role: MessageRole;
  textContent?: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  durationMs?: number;
  createdAt: number; // Unix timestamp (ms)
  // Session info attached for context
  sessionTitle?: string;
  projectPath?: string;
  projectName?: string;
}

/**
 * Paginated search results for sessions
 */
export interface SessionSearchResults {
  sessions: SessionSearchResult[];
  nextCursor: number | null;
  total: number;
}

/**
 * Paginated search results for messages
 */
export interface MessageSearchResults {
  messages: MessageSearchResult[];
  nextCursor: number | null;
  total: number;
}

export interface UseSearchSessionsOptions {
  /** Search query string */
  query: string;
  /** Maximum results per page (default: 20) */
  limit?: number;
  /** Offset for pagination (default: 0) */
  cursor?: number;
  /** User ID to filter by (required for multi-user mode) */
  userId?: string;
  /** Enable realtime updates */
  realtime?: boolean;
}

export interface UseSearchMessagesOptions {
  /** Search query string */
  query: string;
  /** Filter to specific session */
  sessionId?: string;
  /** Maximum results per page (default: 20) */
  limit?: number;
  /** Offset for pagination (default: 0) */
  cursor?: number;
  /** User ID to filter by (required for multi-user mode) */
  userId?: string;
  /** Enable realtime updates */
  realtime?: boolean;
}

export interface UseSearchSessionsResult {
  /** Session search results */
  sessions: SessionSearchResult[];
  /** Cursor for next page (null if no more results) */
  nextCursor: number | null;
  /** Total matching results */
  total: number;
  /** Whether data is loading */
  isLoading: boolean;
  /** Error message if search failed */
  error: string | null;
  /** Refetch search results */
  refetch: () => Promise<void>;
}

export interface UseSearchMessagesResult {
  /** Message search results */
  messages: MessageSearchResult[];
  /** Cursor for next page (null if no more results) */
  nextCursor: number | null;
  /** Total matching results */
  total: number;
  /** Whether data is loading */
  isLoading: boolean;
  /** Error message if search failed */
  error: string | null;
  /** Refetch search results */
  refetch: () => Promise<void>;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Escape special characters in a string for use in Pocketbase filter.
 * The ~ operator in Pocketbase is a case-insensitive "contains" operator.
 */
function escapeFilterValue(value: string): string {
  // Escape double quotes and backslashes for Pocketbase filter syntax
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Convert ISO date string to Unix timestamp (milliseconds).
 */
function isoToTimestamp(isoString: string): number {
  return new Date(isoString).getTime();
}

/**
 * Build session search filter.
 * Uses ~ operator for case-insensitive contains search on searchableText.
 */
function buildSessionSearchFilter(
  query: string,
  userId?: string
): string | undefined {
  const conditions: string[] = [];

  // User filter (required in multi-user mode)
  if (userId) {
    conditions.push(`user = "${userId}"`);
  }

  // Text search filter - use ~ for contains (case-insensitive)
  if (query.trim()) {
    const escaped = escapeFilterValue(query.trim());
    conditions.push(`searchableText ~ "${escaped}"`);
  }

  return conditions.length > 0 ? conditions.join(" && ") : undefined;
}

/**
 * Build message search filter.
 * Uses ~ operator for case-insensitive contains search on textContent.
 */
function buildMessageSearchFilter(
  query: string,
  sessionId?: string
): string | undefined {
  const conditions: string[] = [];

  // Session filter
  if (sessionId) {
    conditions.push(`session = "${sessionId}"`);
  }

  // Text search filter - use ~ for contains (case-insensitive)
  if (query.trim()) {
    const escaped = escapeFilterValue(query.trim());
    conditions.push(`textContent ~ "${escaped}"`);
  }

  return conditions.length > 0 ? conditions.join(" && ") : undefined;
}

/**
 * Convert Pocketbase Session to SessionSearchResult format.
 */
function toSessionSearchResult(session: Session): SessionSearchResult {
  return {
    id: session.id,
    externalId: session.externalId,
    title: session.title || undefined,
    projectPath: session.projectPath || undefined,
    projectName: session.projectName || undefined,
    model: session.model || undefined,
    provider: inferProvider(session),
    source: session.source || "opencode",
    totalTokens: session.totalTokens || 0,
    cost: session.cost || 0,
    isPublic: session.isPublic || false,
    messageCount: session.messageCount || 0,
    summary: session.summary || undefined,
    createdAt: isoToTimestamp(session.created),
    updatedAt: isoToTimestamp(session.updated),
  };
}

/**
 * Convert Pocketbase Message to MessageSearchResult format.
 */
function toMessageSearchResult(
  message: Message,
  sessionInfo?: { title?: string; projectPath?: string; projectName?: string }
): MessageSearchResult {
  return {
    id: message.id,
    sessionId: message.session,
    externalId: message.externalId,
    role: message.role,
    textContent: message.textContent || undefined,
    model: message.model || undefined,
    promptTokens: message.promptTokens || undefined,
    completionTokens: message.completionTokens || undefined,
    durationMs: message.durationMs || undefined,
    createdAt: isoToTimestamp(message.created),
    sessionTitle: sessionInfo?.title,
    projectPath: sessionInfo?.projectPath,
    projectName: sessionInfo?.projectName,
  };
}

// ============================================================================
// Hook: useSearchSessions
// ============================================================================

/**
 * Hook to search sessions using full-text search on searchableText field.
 *
 * Empty query returns recent sessions sorted by updated descending.
 *
 * @example
 * ```tsx
 * const { sessions, isLoading, nextCursor, total, refetch } = useSearchSessions({
 *   query: "authentication bug",
 *   limit: 20,
 *   cursor: 0,
 *   userId: currentUser?.id,
 * });
 * ```
 */
export function useSearchSessions(
  options: UseSearchSessionsOptions
): UseSearchSessionsResult {
  const {
    query,
    limit = 20,
    cursor = 0,
    userId,
    realtime = false,
  } = options;

  const [sessions, setSessions] = useState<SessionSearchResult[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
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
      // Calculate page number from cursor (1-based for Pocketbase)
      const page = Math.floor(cursor / limit) + 1;

      // Build filter
      const filter = buildSessionSearchFilter(query, userId);

      // Sort: always by updated descending for consistent results
      const sort = "-updated";

      const result = await pb
        .collection(Collections.SESSIONS)
        .getList<Session>(page, limit, {
          filter: filter || undefined,
          sort,
        });

      // Convert to search result format
      const sessionResults = result.items.map(toSessionSearchResult);

      setSessions(sessionResults);
      setTotal(result.totalItems);

      // Calculate next cursor
      const hasMore = cursor + limit < result.totalItems;
      setNextCursor(hasMore ? cursor + limit : null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to search sessions";
      setError(message);
      console.error("useSearchSessions error:", err);
      setSessions([]);
      setTotal(0);
      setNextCursor(null);
    } finally {
      setIsLoading(false);
    }
  }, [query, limit, cursor, userId]);

  // Initial fetch and refetch on options change
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Realtime subscription
  useEffect(() => {
    if (!realtime) return;

    const subscribe = async () => {
      try {
        unsubscribeRef.current = await pb
          .collection(Collections.SESSIONS)
          .subscribe("*", (e) => {
            // Refetch on any change to keep results consistent
            if (
              e.action === "create" ||
              e.action === "update" ||
              e.action === "delete"
            ) {
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
    nextCursor,
    total,
    isLoading,
    error,
    refetch: fetchSessions,
  };
}

// ============================================================================
// Hook: useSearchMessages
// ============================================================================

/**
 * Hook to search messages using full-text search on textContent field.
 *
 * Empty query returns empty array (user must search for something).
 *
 * @example
 * ```tsx
 * const { messages, isLoading, nextCursor, total, refetch } = useSearchMessages({
 *   query: "fix the bug",
 *   limit: 20,
 *   cursor: 0,
 *   userId: currentUser?.id,
 * });
 * ```
 */
export function useSearchMessages(
  options: UseSearchMessagesOptions
): UseSearchMessagesResult {
  const {
    query,
    sessionId,
    limit = 20,
    cursor = 0,
    userId,
    realtime = false,
  } = options;

  const [messages, setMessages] = useState<MessageSearchResult[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cache session info to avoid refetching
  const sessionCacheRef = useRef<
    Map<string, { title?: string; projectPath?: string; projectName?: string }>
  >(new Map());

  // Unsubscribe function for realtime
  const unsubscribeRef = useRef<UnsubscribeFunc | null>(null);

  const fetchMessages = useCallback(async () => {
    // Empty query returns no results (matches Convex behavior)
    if (!query.trim()) {
      setMessages([]);
      setNextCursor(null);
      setTotal(0);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Calculate page number from cursor (1-based for Pocketbase)
      const page = Math.floor(cursor / limit) + 1;

      // Build filter
      const filter = buildMessageSearchFilter(query, sessionId);

      // If userId is specified but no sessionId, we need to filter messages
      // to only those belonging to user's sessions.
      // This requires getting user's sessions first (similar to Convex approach)
      let userSessionIds: Set<string> | null = null;
      let sessionInfoMap: Map<
        string,
        { title?: string; projectPath?: string; projectName?: string }
      > = new Map();

      if (userId && !sessionId) {
        // Fetch user's sessions to filter messages
        const userSessions = await pb
          .collection(Collections.SESSIONS)
          .getFullList<Session>({
            filter: `user = "${userId}"`,
            fields: "id,title,projectPath,projectName",
          });

        userSessionIds = new Set(userSessions.map((s) => s.id));
        sessionInfoMap = new Map(
          userSessions.map((s) => [
            s.id,
            {
              title: s.title || undefined,
              projectPath: s.projectPath || undefined,
              projectName: s.projectName || undefined,
            },
          ])
        );
      }

      // Fetch messages
      // We fetch more than needed to account for filtering by user's sessions
      const fetchLimit = userSessionIds ? limit * 2 : limit;

      const result = await pb
        .collection(Collections.MESSAGES)
        .getList<Message>(page, fetchLimit, {
          filter: filter || undefined,
          sort: "-created",
        });

      let items = result.items;

      // Filter to only user's sessions if needed
      if (userSessionIds) {
        items = items.filter((m) => userSessionIds!.has(m.session));
      }

      // Paginate after filtering
      const paginatedItems = items.slice(0, limit);
      const hasMore = items.length > limit;

      // If filtering by sessionId, get session info
      if (sessionId && !sessionInfoMap.has(sessionId)) {
        try {
          const session = await pb
            .collection(Collections.SESSIONS)
            .getOne<Session>(sessionId, {
              fields: "id,title,projectPath,projectName",
            });
          sessionInfoMap.set(sessionId, {
            title: session.title || undefined,
            projectPath: session.projectPath || undefined,
            projectName: session.projectName || undefined,
          });
        } catch {
          // Session not found, continue without info
        }
      }

      // Fetch missing session info for messages
      const missingSessionIds = [
        ...new Set(
          paginatedItems
            .filter((m) => !sessionInfoMap.has(m.session))
            .map((m) => m.session)
        ),
      ];

      if (missingSessionIds.length > 0) {
        // Batch fetch missing sessions
        const filter = missingSessionIds
          .map((id) => `id = "${id}"`)
          .join(" || ");
        const missingSessions = await pb
          .collection(Collections.SESSIONS)
          .getFullList<Session>({
            filter,
            fields: "id,title,projectPath,projectName",
          });

        for (const s of missingSessions) {
          sessionInfoMap.set(s.id, {
            title: s.title || undefined,
            projectPath: s.projectPath || undefined,
            projectName: s.projectName || undefined,
          });
        }
      }

      // Update cache
      sessionCacheRef.current = sessionInfoMap;

      // Convert to search result format with session info
      const messageResults = paginatedItems.map((m) =>
        toMessageSearchResult(m, sessionInfoMap.get(m.session))
      );

      setMessages(messageResults);
      // Total is approximate when filtering by user sessions
      setTotal(userSessionIds ? items.length : result.totalItems);
      setNextCursor(hasMore ? cursor + limit : null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to search messages";
      setError(message);
      console.error("useSearchMessages error:", err);
      setMessages([]);
      setTotal(0);
      setNextCursor(null);
    } finally {
      setIsLoading(false);
    }
  }, [query, sessionId, limit, cursor, userId]);

  // Initial fetch and refetch on options change
  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Realtime subscription
  useEffect(() => {
    if (!realtime || !query.trim()) return;

    const subscribe = async () => {
      try {
        unsubscribeRef.current = await pb
          .collection(Collections.MESSAGES)
          .subscribe("*", (e) => {
            // Refetch on any change to keep results consistent
            if (
              e.action === "create" ||
              e.action === "update" ||
              e.action === "delete"
            ) {
              fetchMessages();
            }
          });
      } catch (err) {
        console.error("Failed to subscribe to messages:", err);
      }
    };

    subscribe();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [realtime, query, fetchMessages]);

  return {
    messages,
    nextCursor,
    total,
    isLoading,
    error,
    refetch: fetchMessages,
  };
}

export default { useSearchSessions, useSearchMessages };
