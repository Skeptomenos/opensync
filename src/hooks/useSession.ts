/**
 * useSession Hook - Fetch a single session with messages and parts from Pocketbase
 *
 * Replaces Convex useQuery(api.sessions.get, { sessionId })
 *
 * Features:
 * - Fetch single session by ID
 * - Expand messages with parts
 * - Realtime updates via Pocketbase subscriptions
 * - Generate markdown representation
 *
 * @see ralph-wiggum/specs/POCKETBASE_MIGRATION.md - Migration spec
 * @see convex/sessions.ts:get - Original implementation
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { pb } from "../lib/pocketbase";
import {
  Collections,
  type Session,
  type Message,
  type Part,
  type SessionSource,
} from "../lib/types";
import { inferProvider } from "./useSessions";
import type { UnsubscribeFunc } from "pocketbase";

// ============================================================================
// Types
// ============================================================================

/**
 * Message with parts included for SessionViewer.
 * Parts are sorted by order and attached to the message.
 */
export interface SessionMessage {
  id: string;
  role: "user" | "assistant" | "system" | "unknown";
  textContent?: string;
  createdAt: number;
  parts: Array<{ type: string; content: unknown }>;
}

/**
 * Session with computed fields for SessionViewer.
 */
export interface SessionWithMessages extends Session {
  messages: SessionMessage[];
}

export interface UseSessionOptions {
  /** Session ID to fetch */
  sessionId: string | null | undefined;
  /** Enable realtime updates */
  realtime?: boolean;
}

export interface UseSessionResult {
  /** The session data (null if not found or loading) */
  session: SessionWithMessages | null;
  /** Whether data is loading */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Refetch session data */
  refetch: () => Promise<void>;
  /** Get session as markdown */
  markdown: string | null;
}

// ============================================================================
// Markdown Generation
// ============================================================================

/**
 * Generate markdown representation of a session.
 * Mirrors convex/sessions.ts:getMarkdown logic.
 *
 * Why client-side: Pocketbase hooks can't access response body easily,
 * and markdown generation is a presentation concern that belongs in the UI.
 */
function generateMarkdown(session: Session, messages: SessionMessage[]): string {
  const lines: string[] = [];

  // Header
  lines.push(`# ${session.title || "Untitled Session"}`);
  lines.push("");

  // Metadata
  if (session.projectPath) {
    lines.push(`**Project:** ${session.projectPath}`);
  }
  if (session.model) {
    lines.push(`**Model:** ${session.model}`);
  }
  lines.push(`**Tokens:** ${session.totalTokens.toLocaleString()}`);
  lines.push(`**Cost:** $${session.cost.toFixed(4)}`);
  if (session.durationMs) {
    const minutes = Math.floor(session.durationMs / 60000);
    const seconds = Math.floor((session.durationMs % 60000) / 1000);
    const duration = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    lines.push(`**Duration:** ${duration}`);
  }
  lines.push(`**Created:** ${new Date(session.created).toLocaleString()}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // Messages
  for (const message of messages) {
    const roleLabel =
      message.role === "user"
        ? "**User:**"
        : message.role === "assistant"
          ? "**Assistant:**"
          : message.role === "system"
            ? "**System:**"
            : "**Unknown:**";

    lines.push(roleLabel);
    lines.push("");

    // Render parts or fallback to textContent
    const hasPartsContent = message.parts?.some((part) => {
      if (part.type === "text") {
        const text = getTextFromContent(part.content);
        return text && text.trim().length > 0;
      }
      return part.type === "tool-call" || part.type === "tool-result";
    });

    if (hasPartsContent) {
      for (const part of message.parts) {
        if (part.type === "text") {
          const text = getTextFromContent(part.content);
          if (text) {
            lines.push(text);
            lines.push("");
          }
        } else if (part.type === "tool-call") {
          const details = getToolCallDetails(part.content);
          lines.push(`> **Tool Call:** ${details.name}`);
          lines.push("```json");
          lines.push(JSON.stringify(details.args, null, 2));
          lines.push("```");
          lines.push("");
        } else if (part.type === "tool-result") {
          const result = getToolResultText(part.content);
          lines.push("> **Tool Result:**");
          lines.push("```");
          lines.push(result);
          lines.push("```");
          lines.push("");
        }
      }
    } else if (message.textContent) {
      lines.push(message.textContent);
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

// Helper functions for markdown generation (mirrors SessionViewer helpers)
function getTextFromContent(content: unknown): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (typeof content === "object" && content !== null) {
    const obj = content as Record<string, unknown>;
    if (typeof obj.text === "string") return obj.text;
    if (typeof obj.content === "string") return obj.content;
  }
  return "";
}

function getToolCallDetails(content: unknown): { name: string; args: unknown } {
  if (!content || typeof content !== "object") {
    return { name: "Unknown Tool", args: {} };
  }
  const obj = content as Record<string, unknown>;
  return {
    name: (obj.name as string) || (obj.toolName as string) || "Unknown Tool",
    args: obj.args || obj.arguments || obj.input || {},
  };
}

function getToolResultText(content: unknown): string {
  if (!content) return "";
  if (typeof content !== "object") return String(content);
  const obj = content as Record<string, unknown>;
  const result = obj.result ?? obj.output ?? content;
  if (typeof result === "string") return result;
  return JSON.stringify(result, null, 2);
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook to fetch a single session with its messages and parts.
 *
 * @example
 * ```tsx
 * const { session, isLoading, error, markdown } = useSession({
 *   sessionId: "abc123",
 *   realtime: true,
 * });
 *
 * if (session) {
 *   return <SessionViewer session={session} messages={session.messages} />;
 * }
 * ```
 */
export function useSession(options: UseSessionOptions): UseSessionResult {
  const { sessionId, realtime = false } = options;

  const [session, setSession] = useState<SessionWithMessages | null>(null);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Unsubscribe functions for realtime
  const sessionUnsubscribeRef = useRef<UnsubscribeFunc | null>(null);
  const messagesUnsubscribeRef = useRef<UnsubscribeFunc | null>(null);
  const partsUnsubscribeRef = useRef<UnsubscribeFunc | null>(null);

  const fetchSession = useCallback(async () => {
    if (!sessionId) {
      setSession(null);
      setMarkdown(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Fetch the session
      const sessionRecord = await pb
        .collection(Collections.SESSIONS)
        .getOne<Session>(sessionId);

      // 2. Fetch messages for this session, sorted by created date
      const messagesResult = await pb
        .collection(Collections.MESSAGES)
        .getList<Message>(1, 500, {
          filter: `session = "${sessionId}"`,
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

      // 5. Build SessionMessage array with parts attached
      const sessionMessages: SessionMessage[] = messagesResult.items.map((msg) => {
        const parts = partsByMessage.get(msg.id) || [];
        // Sort parts by order (should already be sorted, but ensure consistency)
        parts.sort((a, b) => a.order - b.order);

        return {
          id: msg.id,
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

      // 6. Apply inferProvider for consistency
      const processedSession: SessionWithMessages = {
        ...sessionRecord,
        provider: inferProvider(sessionRecord),
        source: (sessionRecord.source || "opencode") as SessionSource,
        messages: sessionMessages,
      };

      setSession(processedSession);

      // 7. Generate markdown
      const md = generateMarkdown(processedSession, sessionMessages);
      setMarkdown(md);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch session";
      setError(message);
      setSession(null);
      setMarkdown(null);
      console.error("useSession error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  // Initial fetch and refetch on sessionId change
  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  // Realtime subscriptions
  useEffect(() => {
    if (!realtime || !sessionId) return;

    const setupSubscriptions = async () => {
      try {
        // Subscribe to this specific session
        sessionUnsubscribeRef.current = await pb
          .collection(Collections.SESSIONS)
          .subscribe(sessionId, (e) => {
            if (e.action === "update" || e.action === "delete") {
              fetchSession();
            }
          });

        // Subscribe to messages collection with filter
        // Note: Pocketbase realtime doesn't support filtered subscriptions,
        // so we subscribe to all and filter in the callback
        messagesUnsubscribeRef.current = await pb
          .collection(Collections.MESSAGES)
          .subscribe("*", (e) => {
            // Check if this message belongs to our session
            // e.record is RecordModel, so we access the session field directly
            const recordSession = (e.record as { session?: string }).session;
            if (recordSession === sessionId) {
              fetchSession();
            }
          });

        // Subscribe to parts collection
        // We need to refetch when any part changes for messages in this session
        partsUnsubscribeRef.current = await pb
          .collection(Collections.PARTS)
          .subscribe("*", () => {
            // Parts don't have session reference, so we refetch on any change
            // This is inefficient but necessary for correctness
            // TODO: Consider caching message IDs and checking in callback
            fetchSession();
          });
      } catch (err) {
        console.error("Failed to subscribe to session updates:", err);
      }
    };

    setupSubscriptions();

    return () => {
      if (sessionUnsubscribeRef.current) {
        sessionUnsubscribeRef.current();
        sessionUnsubscribeRef.current = null;
      }
      if (messagesUnsubscribeRef.current) {
        messagesUnsubscribeRef.current();
        messagesUnsubscribeRef.current = null;
      }
      if (partsUnsubscribeRef.current) {
        partsUnsubscribeRef.current();
        partsUnsubscribeRef.current = null;
      }
    };
  }, [realtime, sessionId, fetchSession]);

  return {
    session,
    isLoading,
    error,
    refetch: fetchSession,
    markdown,
  };
}

export default useSession;
