/**
 * usePublicSession Hook - Fetch a public session by slug from Pocketbase
 *
 * Replaces Convex useQuery(api.sessions.getPublic, { slug })
 *
 * Features:
 * - Fetch public session by publicSlug (no auth required)
 * - Expand messages with parts
 * - Return session + messages structure for PublicSessionPage
 *
 * @see ralph-wiggum/specs/POCKETBASE_MIGRATION.md - Migration spec
 * @see convex/sessions.ts:getPublic - Original implementation
 */

import { useState, useEffect, useCallback } from "react";
import { pb } from "../lib/pocketbase";
import {
  Collections,
  type Session,
  type Message,
  type Part,
} from "../lib/types";
import { inferProvider } from "./useSessions";

// ============================================================================
// Types
// ============================================================================

/**
 * Public message format for PublicSessionPage.
 * Includes _id for backwards compatibility with the component's key prop.
 */
export interface PublicMessage {
  /** Pocketbase record ID (used for React keys) */
  _id: string;
  role: "user" | "assistant" | "system" | "unknown";
  textContent?: string;
  createdAt: number;
  parts: Array<{ type: string; content: unknown }>;
}

/**
 * Public session format for PublicSessionPage.
 * Matches the structure returned by Convex getPublic.
 */
export interface PublicSession {
  title?: string;
  projectPath?: string;
  model?: string;
  provider?: string;
  totalTokens: number;
  createdAt: number;
}

/**
 * Data returned by usePublicSession, matching Convex getPublic structure.
 * Returns { session, messages } when found, null when not found.
 */
export interface PublicSessionData {
  session: PublicSession;
  messages: PublicMessage[];
}

export interface UsePublicSessionOptions {
  /** Public slug to fetch */
  slug: string | undefined;
}

export interface UsePublicSessionResult {
  /** The session data (null if not found, undefined if loading) */
  data: PublicSessionData | null | undefined;
  /** Whether data is loading */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Refetch session data */
  refetch: () => Promise<void>;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook to fetch a public session by its publicSlug.
 *
 * This hook is used by PublicSessionPage to display shared sessions
 * without requiring authentication.
 *
 * @example
 * ```tsx
 * const { data, isLoading, error } = usePublicSession({ slug: "abc123" });
 *
 * if (data === undefined) return <Loading />;
 * if (data === null) return <NotFound />;
 *
 * const { session, messages } = data;
 * return <SessionViewer session={session} messages={messages} />;
 * ```
 */
export function usePublicSession(
  options: UsePublicSessionOptions
): UsePublicSessionResult {
  const { slug } = options;

  // undefined = loading, null = not found
  const [data, setData] = useState<PublicSessionData | null | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSession = useCallback(async () => {
    if (!slug) {
      setData(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Fetch the session by publicSlug where isPublic = true
      // Use getFirstListItem to get exactly one record matching the filter
      let sessionRecord: Session | null = null;
      try {
        sessionRecord = await pb
          .collection(Collections.SESSIONS)
          .getFirstListItem<Session>(`publicSlug = "${slug}" && isPublic = true`);
      } catch (err) {
        // getFirstListItem throws if no record found - this is expected for 404
        if ((err as { status?: number }).status === 404) {
          setData(null);
          setIsLoading(false);
          return;
        }
        throw err;
      }

      // 2. Fetch messages for this session, sorted by created date
      const messagesResult = await pb
        .collection(Collections.MESSAGES)
        .getList<Message>(1, 500, {
          filter: `session = "${sessionRecord.id}"`,
          sort: "created",
        });

      // 3. Fetch parts for all messages in a single query
      const messageIds = messagesResult.items.map((m) => m.id);
      let allParts: Part[] = [];

      if (messageIds.length > 0) {
        // Build filter for all message IDs: message = "id1" || message = "id2" || ...
        const partsFilter = messageIds.map((id) => `message = "${id}"`).join(" || ");
        const partsResult = await pb
          .collection(Collections.PARTS)
          .getList<Part>(1, 5000, {
            filter: partsFilter,
            sort: "order",
          });
        allParts = partsResult.items;
      }

      // 4. Group parts by message ID
      const partsByMessage = new Map<string, Part[]>();
      for (const part of allParts) {
        const messageId = part.message;
        if (!partsByMessage.has(messageId)) {
          partsByMessage.set(messageId, []);
        }
        partsByMessage.get(messageId)!.push(part);
      }

      // 5. Build PublicMessage array with parts attached
      const publicMessages: PublicMessage[] = messagesResult.items.map((msg) => {
        const parts = partsByMessage.get(msg.id) || [];
        // Sort parts by order (should already be sorted, but ensure consistency)
        parts.sort((a, b) => a.order - b.order);

        return {
          _id: msg.id, // Use _id for compatibility with component's key prop
          role: msg.role,
          textContent: msg.textContent || undefined,
          // Convert Pocketbase ISO string to timestamp for UI compatibility
          createdAt: new Date(msg.created).getTime(),
          parts: parts.map((p) => ({
            type: p.type,
            content: p.content,
          })),
        };
      });

      // 6. Build PublicSession with inferred provider
      const provider = inferProvider({
        model: sessionRecord.model,
        provider: sessionRecord.provider,
      });

      const publicSession: PublicSession = {
        title: sessionRecord.title || undefined,
        projectPath: sessionRecord.projectPath || undefined,
        model: sessionRecord.model || undefined,
        provider: provider,
        totalTokens: sessionRecord.totalTokens,
        createdAt: new Date(sessionRecord.created).getTime(),
      };

      setData({
        session: publicSession,
        messages: publicMessages,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch public session";
      setError(message);
      setData(null);
      console.error("usePublicSession error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [slug]);

  // Fetch on mount and when slug changes
  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchSession,
  };
}

export default usePublicSession;
