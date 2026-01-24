/**
 * useMessages Hook - Fetch messages with parts expansion from Pocketbase
 *
 * Replaces Convex useQuery for fetching messages within a session.
 *
 * Features:
 * - Fetch messages for a session with parts expanded
 * - Pagination support for large sessions
 * - Realtime updates via Pocketbase subscriptions
 * - Filter by role or search text
 *
 * Why this hook exists (vs useSession):
 * - Standalone message fetching without full session data
 * - Useful for message search, filtering, and independent rendering
 * - More efficient when session metadata isn't needed
 *
 * @see ralph-wiggum/specs/POCKETBASE_MIGRATION.md - Migration spec
 * @see convex/messages.ts - Original implementation
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { pb } from "../lib/pocketbase";
import {
  Collections,
  type Message,
  type Part,
  type MessageRole,
} from "../lib/types";
import type { UnsubscribeFunc } from "pocketbase";

// ============================================================================
// Types
// ============================================================================

/**
 * Message with parts attached for rendering.
 * Parts are sorted by order and attached to the message.
 *
 * Note: Uses `id` instead of `_id` to match Pocketbase conventions.
 * SessionViewer expects `_id` for Convex compatibility - callers should
 * map this if needed.
 */
export interface MessageWithParts {
  id: string;
  role: MessageRole;
  textContent?: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  durationMs?: number;
  createdAt: number; // Timestamp for sorting and display
  parts: Array<{ type: string; content: unknown }>;
}

export interface UseMessagesOptions {
  /** Session ID to fetch messages for (required) */
  sessionId: string | null | undefined;
  /** Maximum number of messages to return (default: 500) */
  limit?: number;
  /** Page number for pagination (1-based, default: 1) */
  page?: number;
  /** Filter by message role */
  role?: MessageRole;
  /** Search within message text content */
  search?: string;
  /** Enable realtime updates */
  realtime?: boolean;
}

export interface UseMessagesResult {
  /** List of messages with parts */
  messages: MessageWithParts[];
  /** Total number of messages matching filters */
  total: number;
  /** Total pages available */
  totalPages: number;
  /** Current page */
  page: number;
  /** Whether data is loading */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Refetch messages */
  refetch: () => Promise<void>;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build Pocketbase filter expression from options.
 */
function buildFilter(options: UseMessagesOptions): string {
  const conditions: string[] = [];

  // Session filter (required)
  if (options.sessionId) {
    conditions.push(`session = "${options.sessionId}"`);
  }

  // Role filter
  if (options.role) {
    conditions.push(`role = "${options.role}"`);
  }

  // Text search filter (searches textContent field)
  if (options.search) {
    // Pocketbase uses ~ for contains/like operator
    const escaped = options.search.replace(/"/g, '\\"');
    conditions.push(`textContent ~ "${escaped}"`);
  }

  return conditions.join(" && ");
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook to fetch messages with parts for a session.
 *
 * @example
 * ```tsx
 * const { messages, isLoading, error } = useMessages({
 *   sessionId: "abc123",
 *   realtime: true,
 * });
 *
 * return messages.map((msg) => (
 *   <MessageBlock key={msg.id} message={msg} />
 * ));
 * ```
 */
export function useMessages(options: UseMessagesOptions): UseMessagesResult {
  const {
    sessionId,
    limit = 500,
    page = 1,
    role,
    search,
    realtime = false,
  } = options;

  const [messages, setMessages] = useState<MessageWithParts[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Unsubscribe functions for realtime
  const messagesUnsubscribeRef = useRef<UnsubscribeFunc | null>(null);
  const partsUnsubscribeRef = useRef<UnsubscribeFunc | null>(null);

  const fetchMessages = useCallback(async () => {
    if (!sessionId) {
      setMessages([]);
      setTotal(0);
      setTotalPages(0);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Fetch messages for this session
      const filter = buildFilter({ sessionId, role, search });
      const messagesResult = await pb
        .collection(Collections.MESSAGES)
        .getList<Message>(page, limit, {
          filter,
          sort: "created", // Oldest first for conversation flow
        });

      // 2. Fetch parts for all messages in a single query
      const messageIds = messagesResult.items.map((m) => m.id);
      let allParts: Part[] = [];

      if (messageIds.length > 0) {
        // Build filter for all message IDs
        // Pocketbase filter syntax: message = "id1" || message = "id2" || ...
        const partsFilter = messageIds
          .map((id) => `message = "${id}"`)
          .join(" || ");

        const partsResult = await pb
          .collection(Collections.PARTS)
          .getList<Part>(1, 5000, {
            filter: partsFilter,
            sort: "order",
          });
        allParts = partsResult.items;
      }

      // 3. Group parts by message ID
      const partsByMessage = new Map<string, Part[]>();
      for (const part of allParts) {
        const messageId = part.message;
        if (!partsByMessage.has(messageId)) {
          partsByMessage.set(messageId, []);
        }
        partsByMessage.get(messageId)!.push(part);
      }

      // 4. Build MessageWithParts array
      const processedMessages: MessageWithParts[] = messagesResult.items.map(
        (msg) => {
          const parts = partsByMessage.get(msg.id) || [];
          // Sort parts by order (should already be sorted, but ensure consistency)
          parts.sort((a, b) => a.order - b.order);

          return {
            id: msg.id,
            role: msg.role,
            textContent: msg.textContent || undefined,
            model: msg.model || undefined,
            promptTokens: msg.promptTokens || undefined,
            completionTokens: msg.completionTokens || undefined,
            durationMs: msg.durationMs || undefined,
            // Convert Pocketbase ISO string to timestamp for UI compatibility
            createdAt: new Date(msg.created).getTime(),
            parts: parts.map((p) => ({
              type: p.type,
              content: p.content,
            })),
          };
        }
      );

      setMessages(processedMessages);
      setTotal(messagesResult.totalItems);
      setTotalPages(messagesResult.totalPages);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch messages";
      setError(message);
      setMessages([]);
      setTotal(0);
      setTotalPages(0);
      console.error("useMessages error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, limit, page, role, search]);

  // Initial fetch and refetch on options change
  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Realtime subscriptions
  useEffect(() => {
    if (!realtime || !sessionId) return;

    const setupSubscriptions = async () => {
      try {
        // Subscribe to messages collection
        // Filter in callback since Pocketbase realtime doesn't support filtered subscriptions
        messagesUnsubscribeRef.current = await pb
          .collection(Collections.MESSAGES)
          .subscribe("*", (e) => {
            // Check if this message belongs to our session
            const recordSession = (e.record as { session?: string }).session;
            if (recordSession === sessionId) {
              fetchMessages();
            }
          });

        // Subscribe to parts collection
        // Parts don't have direct session reference, so we refetch on any change
        // that affects our messages. This is less efficient but correct.
        partsUnsubscribeRef.current = await pb
          .collection(Collections.PARTS)
          .subscribe("*", () => {
            // Refetch to ensure parts are current
            // TODO: Consider caching message IDs and checking part.message in callback
            fetchMessages();
          });
      } catch (err) {
        console.error("Failed to subscribe to message updates:", err);
      }
    };

    setupSubscriptions();

    return () => {
      if (messagesUnsubscribeRef.current) {
        messagesUnsubscribeRef.current();
        messagesUnsubscribeRef.current = null;
      }
      if (partsUnsubscribeRef.current) {
        partsUnsubscribeRef.current();
        partsUnsubscribeRef.current = null;
      }
    };
  }, [realtime, sessionId, fetchMessages]);

  return {
    messages,
    total,
    totalPages,
    page,
    isLoading,
    error,
    refetch: fetchMessages,
  };
}

export default useMessages;
