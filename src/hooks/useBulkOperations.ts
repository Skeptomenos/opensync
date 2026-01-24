/**
 * useBulkOperations Hook - Bulk delete and export operations for sessions
 *
 * Provides bulk operations for multi-select scenarios in Dashboard and Settings.
 *
 * Features:
 * - Bulk delete sessions with cascade (parts -> messages -> embeddings -> session)
 * - Bulk export sessions in JSON, CSV, or Markdown format
 * - Progress tracking for long-running operations
 *
 * @see ralph-wiggum/specs/POCKETBASE_MIGRATION.md - Migration spec
 * @see ralph-wiggum/code/plan.md - Task 4.4
 */

import { useState, useCallback } from "react";
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
 * Export format options for bulk export.
 */
export type BulkExportFormat = "json" | "csv" | "markdown";

/**
 * Result of a bulk delete operation.
 */
export interface BulkDeleteResult {
  /** Number of sessions successfully deleted */
  deleted: number;
  /** IDs of sessions that failed to delete */
  failed: string[];
  /** Total time in milliseconds */
  durationMs: number;
}

/**
 * Result of a bulk export operation.
 */
export interface BulkExportResult {
  /** The exported data as a string */
  data: string;
  /** Suggested filename */
  filename: string;
  /** MIME type for download */
  mimeType: string;
  /** Export statistics */
  stats: {
    sessions: number;
    messages: number;
    parts: number;
  };
}

/**
 * Progress callback for tracking bulk operations.
 */
export interface BulkOperationProgress {
  /** Current operation being performed */
  operation: "fetching" | "deleting" | "exporting";
  /** Current item index (0-based) */
  current: number;
  /** Total items to process */
  total: number;
  /** Current session ID being processed */
  sessionId?: string;
}

/**
 * Hook options.
 */
export interface UseBulkOperationsOptions {
  /** Callback for progress updates during long operations */
  onProgress?: (progress: BulkOperationProgress) => void;
}

/**
 * Hook result.
 */
export interface UseBulkOperationsResult {
  /** Bulk delete multiple sessions */
  deleteMultipleSessions: (sessionIds: string[]) => Promise<BulkDeleteResult>;
  /** Bulk export sessions */
  exportSessions: (
    sessionIds: string[],
    format: BulkExportFormat
  ) => Promise<BulkExportResult>;
  /** Whether a bulk operation is in progress */
  isProcessing: boolean;
  /** Error from last operation */
  error: string | null;
  /** Clear error state */
  clearError: () => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Escape a value for CSV output.
 * Handles quotes, commas, and newlines.
 */
function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // If contains comma, quote, or newline, wrap in quotes and escape existing quotes
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Format session as markdown document.
 */
function formatSessionMarkdown(
  session: Session,
  messages: Message[],
  parts: Part[]
): string {
  const lines: string[] = [];

  // Header
  lines.push(`# ${session.title || "Untitled Session"}`);
  lines.push("");

  // Metadata
  lines.push("## Session Info");
  lines.push("");
  lines.push(`- **ID:** ${session.externalId}`);
  if (session.projectPath) {
    lines.push(`- **Project:** ${session.projectPath}`);
  }
  if (session.model) {
    lines.push(`- **Model:** ${session.model}`);
  }
  lines.push(`- **Provider:** ${inferProvider(session)}`);
  lines.push(`- **Tokens:** ${session.totalTokens.toLocaleString()}`);
  lines.push(`- **Cost:** $${session.cost.toFixed(4)}`);
  if (session.durationMs) {
    const minutes = Math.floor(session.durationMs / 60000);
    const seconds = Math.floor((session.durationMs % 60000) / 1000);
    const duration = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    lines.push(`- **Duration:** ${duration}`);
  }
  lines.push(`- **Created:** ${session.created}`);
  lines.push(`- **Source:** ${session.source || "opencode"}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // Group parts by message
  const partsByMessage = new Map<string, Part[]>();
  for (const part of parts) {
    const messageId = part.message;
    if (!partsByMessage.has(messageId)) {
      partsByMessage.set(messageId, []);
    }
    partsByMessage.get(messageId)!.push(part);
  }

  // Messages
  lines.push("## Conversation");
  lines.push("");

  for (const message of messages) {
    const roleLabel =
      message.role === "user"
        ? "### User"
        : message.role === "assistant"
          ? "### Assistant"
          : message.role === "system"
            ? "### System"
            : "### Unknown";

    lines.push(roleLabel);
    lines.push("");

    // Get parts for this message
    const msgParts = partsByMessage.get(message.id) || [];
    msgParts.sort((a, b) => a.order - b.order);

    // Render parts or fallback to textContent
    const hasPartsContent = msgParts.some((part) => {
      if (part.type === "text") {
        const text = getTextFromContent(part.content);
        return text && text.trim().length > 0;
      }
      return part.type === "tool_call" || part.type === "tool_result";
    });

    if (hasPartsContent) {
      for (const part of msgParts) {
        if (part.type === "text") {
          const text = getTextFromContent(part.content);
          if (text) {
            lines.push(text);
            lines.push("");
          }
        } else if (part.type === "tool_call") {
          const details = getToolCallDetails(part.content);
          lines.push(`> **Tool Call:** ${details.name}`);
          lines.push("```json");
          lines.push(JSON.stringify(details.args, null, 2));
          lines.push("```");
          lines.push("");
        } else if (part.type === "tool_result") {
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

// Helper functions for markdown generation (same as useSession.ts)
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
 * Hook for bulk operations on sessions.
 *
 * @example
 * ```tsx
 * const { deleteMultipleSessions, exportSessions, isProcessing } = useBulkOperations({
 *   onProgress: (p) => console.log(`${p.current}/${p.total}`),
 * });
 *
 * // Delete selected sessions
 * const result = await deleteMultipleSessions(selectedIds);
 * console.log(`Deleted ${result.deleted} sessions`);
 *
 * // Export to CSV
 * const exportResult = await exportSessions(selectedIds, 'csv');
 * downloadFile(exportResult.data, exportResult.filename, exportResult.mimeType);
 * ```
 */
export function useBulkOperations(
  options: UseBulkOperationsOptions = {}
): UseBulkOperationsResult {
  const { onProgress } = options;

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  /**
   * Delete multiple sessions with cascade.
   * Deletes in order: parts -> messages -> embeddings -> sessions.
   *
   * Why sequential deletion: Pocketbase doesn't have batch delete API,
   * and we need to respect foreign key constraints. Parallelizing would
   * risk constraint violations.
   */
  const deleteMultipleSessions = useCallback(
    async (sessionIds: string[]): Promise<BulkDeleteResult> => {
      if (sessionIds.length === 0) {
        return { deleted: 0, failed: [], durationMs: 0 };
      }

      setIsProcessing(true);
      setError(null);
      const startTime = Date.now();
      const failed: string[] = [];
      let deleted = 0;

      try {
        for (let i = 0; i < sessionIds.length; i++) {
          const sessionId = sessionIds[i];

          onProgress?.({
            operation: "deleting",
            current: i,
            total: sessionIds.length,
            sessionId,
          });

          try {
            // 1. Get all messages for this session
            const messagesResult = await pb
              .collection(Collections.MESSAGES)
              .getList<Message>(1, 500, {
                filter: `session = "${sessionId}"`,
              });
            const messageIds = messagesResult.items.map((m) => m.id);

            // 2. Delete all parts for these messages
            if (messageIds.length > 0) {
              const partsFilter = messageIds
                .map((id) => `message = "${id}"`)
                .join(" || ");
              const partsResult = await pb
                .collection(Collections.PARTS)
                .getList<Part>(1, 5000, { filter: partsFilter });

              for (const part of partsResult.items) {
                await pb.collection(Collections.PARTS).delete(part.id);
              }
            }

            // 3. Delete all messages
            for (const msg of messagesResult.items) {
              await pb.collection(Collections.MESSAGES).delete(msg.id);
            }

            // 4. Delete embeddings (if they exist)
            try {
              const sessionEmbeddings = await pb
                .collection(Collections.SESSION_EMBEDDINGS)
                .getList(1, 100, { filter: `session = "${sessionId}"` });
              for (const emb of sessionEmbeddings.items) {
                await pb
                  .collection(Collections.SESSION_EMBEDDINGS)
                  .delete(emb.id);
              }
            } catch {
              // Collection may not exist yet - ignore
            }

            if (messageIds.length > 0) {
              try {
                const embFilter = messageIds
                  .map((id) => `message = "${id}"`)
                  .join(" || ");
                const messageEmbeddings = await pb
                  .collection(Collections.MESSAGE_EMBEDDINGS)
                  .getList(1, 5000, { filter: embFilter });
                for (const emb of messageEmbeddings.items) {
                  await pb
                    .collection(Collections.MESSAGE_EMBEDDINGS)
                    .delete(emb.id);
                }
              } catch {
                // Collection may not exist yet - ignore
              }
            }

            // 5. Delete the session
            await pb.collection(Collections.SESSIONS).delete(sessionId);
            deleted++;
          } catch (err) {
            console.error(`Failed to delete session ${sessionId}:`, err);
            failed.push(sessionId);
          }
        }

        const durationMs = Date.now() - startTime;

        if (failed.length > 0) {
          setError(
            `Failed to delete ${failed.length} of ${sessionIds.length} sessions`
          );
        }

        return { deleted, failed, durationMs };
      } finally {
        setIsProcessing(false);
      }
    },
    [onProgress]
  );

  /**
   * Export multiple sessions in the specified format.
   *
   * Formats:
   * - json: Full session data with messages and parts as JSON
   * - csv: Flat CSV with one row per session (summary only)
   * - markdown: Concatenated markdown documents, one per session
   */
  const exportSessions = useCallback(
    async (
      sessionIds: string[],
      format: BulkExportFormat
    ): Promise<BulkExportResult> => {
      if (sessionIds.length === 0) {
        throw new Error("No sessions selected for export");
      }

      setIsProcessing(true);
      setError(null);

      try {
        // Fetch all sessions
        onProgress?.({
          operation: "fetching",
          current: 0,
          total: sessionIds.length,
        });

        const sessions: Session[] = [];
        const messagesBySession: Record<string, Message[]> = {};
        const partsBySession: Record<string, Part[]> = {};
        let totalMessages = 0;
        let totalParts = 0;

        for (let i = 0; i < sessionIds.length; i++) {
          const sessionId = sessionIds[i];

          onProgress?.({
            operation: "fetching",
            current: i,
            total: sessionIds.length,
            sessionId,
          });

          // Fetch session
          const session = await pb
            .collection(Collections.SESSIONS)
            .getOne<Session>(sessionId);
          sessions.push(session);

          // Fetch messages
          const messagesResult = await pb
            .collection(Collections.MESSAGES)
            .getList<Message>(1, 500, {
              filter: `session = "${sessionId}"`,
              sort: "created",
            });
          messagesBySession[sessionId] = messagesResult.items;
          totalMessages += messagesResult.items.length;

          // Fetch parts if format needs them
          if (format === "json" || format === "markdown") {
            const messageIds = messagesResult.items.map((m) => m.id);
            if (messageIds.length > 0) {
              const partsFilter = messageIds
                .map((id) => `message = "${id}"`)
                .join(" || ");
              const partsResult = await pb
                .collection(Collections.PARTS)
                .getList<Part>(1, 5000, {
                  filter: partsFilter,
                  sort: "order",
                });
              partsBySession[sessionId] = partsResult.items;
              totalParts += partsResult.items.length;
            } else {
              partsBySession[sessionId] = [];
            }
          }
        }

        const timestamp = new Date().toISOString().split("T")[0];
        const stats = {
          sessions: sessions.length,
          messages: totalMessages,
          parts: totalParts,
        };

        // ====================================================================
        // JSON Format
        // ====================================================================
        if (format === "json") {
          const exportData = sessions.map((session) => ({
            id: session.id,
            externalId: session.externalId,
            title: session.title,
            projectPath: session.projectPath,
            projectName: session.projectName,
            model: session.model,
            provider: inferProvider(session),
            source: session.source || "opencode",
            promptTokens: session.promptTokens,
            completionTokens: session.completionTokens,
            totalTokens: session.totalTokens,
            cost: session.cost,
            durationMs: session.durationMs,
            messageCount: session.messageCount,
            created: session.created,
            updated: session.updated,
            messages: (messagesBySession[session.id] || []).map((msg) => ({
              id: msg.id,
              role: msg.role,
              textContent: msg.textContent,
              model: msg.model,
              promptTokens: msg.promptTokens,
              completionTokens: msg.completionTokens,
              durationMs: msg.durationMs,
              created: msg.created,
              parts: (partsBySession[session.id] || [])
                .filter((p) => p.message === msg.id)
                .sort((a, b) => a.order - b.order)
                .map((p) => ({
                  type: p.type,
                  content: p.content,
                  order: p.order,
                })),
            })),
          }));

          return {
            data: JSON.stringify(exportData, null, 2),
            filename: `opensync-export-${timestamp}.json`,
            mimeType: "application/json",
            stats,
          };
        }

        // ====================================================================
        // CSV Format
        // ====================================================================
        if (format === "csv") {
          const headers = [
            "id",
            "externalId",
            "title",
            "projectPath",
            "projectName",
            "model",
            "provider",
            "source",
            "promptTokens",
            "completionTokens",
            "totalTokens",
            "cost",
            "durationMs",
            "messageCount",
            "created",
            "updated",
          ];

          const rows = sessions.map((session) => [
            session.id,
            session.externalId,
            session.title || "",
            session.projectPath || "",
            session.projectName || "",
            session.model || "",
            inferProvider(session),
            session.source || "opencode",
            session.promptTokens,
            session.completionTokens,
            session.totalTokens,
            session.cost,
            session.durationMs || 0,
            session.messageCount || 0,
            session.created,
            session.updated,
          ]);

          const csvContent = [
            headers.join(","),
            ...rows.map((row) => row.map(escapeCSV).join(",")),
          ].join("\n");

          return {
            data: csvContent,
            filename: `opensync-export-${timestamp}.csv`,
            mimeType: "text/csv",
            stats,
          };
        }

        // ====================================================================
        // Markdown Format
        // ====================================================================
        const markdownSections = sessions.map((session) =>
          formatSessionMarkdown(
            session,
            messagesBySession[session.id] || [],
            partsBySession[session.id] || []
          )
        );

        // Combine with page breaks
        const markdownContent = markdownSections.join(
          "\n\n<div style=\"page-break-after: always;\"></div>\n\n"
        );

        return {
          data: markdownContent,
          filename: `opensync-export-${timestamp}.md`,
          mimeType: "text/markdown",
          stats,
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to export sessions";
        setError(message);
        throw new Error(message);
      } finally {
        setIsProcessing(false);
      }
    },
    [onProgress]
  );

  return {
    deleteMultipleSessions,
    exportSessions,
    isProcessing,
    error,
    clearError,
  };
}

export default useBulkOperations;
