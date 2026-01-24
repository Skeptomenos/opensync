/**
 * useEvals Hook - Manage eval-ready sessions from Pocketbase
 *
 * Replaces Convex queries/actions:
 * - api.evals.listEvalSessions
 * - api.evals.getEvalTags
 * - api.evals.setEvalReady
 * - api.evals.updateEvalNotes
 * - api.evals.updateEvalTags
 * - api.evals.generateEvalExport
 *
 * @see ralph-wiggum/specs/POCKETBASE_MIGRATION.md - Migration spec
 * @see convex/evals.ts - Original Convex implementation
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { pb } from "../lib/pocketbase";
import {
  Collections,
  type Session,
  type Message,
} from "../lib/types";
import type { UnsubscribeFunc } from "pocketbase";

// ============================================================================
// Types
// ============================================================================

/**
 * Eval session data - matches Convex listEvalSessions return type.
 * Uses Pocketbase id instead of Convex _id.
 */
export interface EvalSession {
  id: string;
  externalId: string;
  title?: string;
  projectPath?: string;
  projectName?: string;
  model?: string;
  provider?: string;
  source?: string;
  totalTokens: number;
  cost: number;
  messageCount: number;
  evalReady?: boolean;
  reviewedAt?: string; // ISO date string in Pocketbase
  evalNotes?: string;
  evalTags?: string[];
  createdAt: number; // Derived from created field
  updatedAt: number; // Derived from updated field
}

/**
 * Eval statistics - matches Convex listEvalSessions stats.
 */
export interface EvalStats {
  total: number;
  bySource: {
    opencode: number;
    claudeCode: number;
    factoryDroid: number;
  };
  totalTestCases: number;
}

/**
 * Export format options.
 */
export type ExportFormat = "deepeval" | "openai" | "filesystem";

/**
 * Export options.
 */
export interface ExportOptions {
  includeSystemPrompts: boolean;
  includeToolCalls: boolean;
  anonymizePaths: boolean;
}

/**
 * Export result.
 */
export interface ExportResult {
  data: string;
  filename: string;
  stats: {
    sessions: number;
    testCases: number;
  };
}

/**
 * Hook options.
 */
export interface UseEvalsOptions {
  /** Filter by source ("opencode", "claude-code", "factory-droid") */
  source?: string;
  /** Filter by eval tags - sessions matching ANY of these tags */
  tags?: string[];
  /** Maximum sessions to return */
  limit?: number;
  /** User ID to filter by (required in multi-user mode) */
  userId?: string;
  /** Enable realtime updates */
  realtime?: boolean;
}

/**
 * Hook result.
 */
export interface UseEvalsResult {
  // Data
  evalSessions: EvalSession[];
  stats: EvalStats;
  allTags: string[];

  // State
  isLoading: boolean;
  error: string | null;

  // Actions
  refetch: () => Promise<void>;

  // Mutations
  setEvalReady: (
    sessionId: string,
    evalReady: boolean,
    notes?: string,
    tags?: string[]
  ) => Promise<void>;
  updateEvalNotes: (sessionId: string, notes: string) => Promise<void>;
  updateEvalTags: (sessionId: string, tags: string[]) => Promise<void>;

  // Export
  generateExport: (
    sessionIds: string[] | "all",
    format: ExportFormat,
    options: ExportOptions
  ) => Promise<ExportResult>;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert Pocketbase Session to EvalSession.
 */
function toEvalSession(session: Session): EvalSession {
  return {
    id: session.id,
    externalId: session.externalId,
    title: session.title || undefined,
    projectPath: session.projectPath || undefined,
    projectName: session.projectName || undefined,
    model: session.model || undefined,
    provider: session.provider || undefined,
    source: session.source || undefined,
    totalTokens: session.totalTokens || 0,
    cost: session.cost || 0,
    messageCount: session.messageCount || 0,
    evalReady: session.evalReady,
    reviewedAt: session.reviewedAt || undefined,
    evalNotes: session.evalNotes || undefined,
    evalTags: session.evalTags || undefined,
    createdAt: new Date(session.created).getTime(),
    updatedAt: new Date(session.updated).getTime(),
  };
}

/**
 * Compute eval statistics from sessions.
 */
function computeStats(sessions: EvalSession[]): EvalStats {
  const opencodeCount = sessions.filter(
    (s) => s.source === "opencode" || !s.source
  ).length;
  const claudeCodeCount = sessions.filter(
    (s) => s.source === "claude-code"
  ).length;
  const factoryDroidCount = sessions.filter(
    (s) => s.source === "factory-droid"
  ).length;
  const totalTestCases = sessions.reduce(
    (sum, s) => sum + s.messageCount,
    0
  );

  return {
    total: sessions.length,
    bySource: {
      opencode: opencodeCount,
      claudeCode: claudeCodeCount,
      factoryDroid: factoryDroidCount,
    },
    totalTestCases,
  };
}

/**
 * Anonymize file paths for export.
 */
function anonymizePaths(text: string): string {
  return text
    .replace(/\/Users\/[^/]+/g, "/Users/user")
    .replace(/\/home\/[^/]+/g, "/home/user")
    .replace(/C:\\Users\\[^\\]+/g, "C:\\Users\\user");
}

/**
 * Generate README content for filesystem export.
 */
function generateReadme(sessionCount: number, testCaseCount: number): string {
  return `================================================================================
OPENSYNC - EVAL EXPORT
================================================================================

Export date: ${new Date().toISOString()}
Sessions: ${sessionCount}
Test cases: ${testCaseCount}

================================================================================
QUICK START
================================================================================

OPTION 1: DeepEval (Recommended)
--------------------------------
pip install deepeval
deepeval test run eval-export.json

Results at: https://app.confident-ai.com
Docs: https://docs.deepeval.com

OPTION 2: OpenAI Evals
--------------------------------
pip install openai-evals
export OPENAI_API_KEY=your-key
oaieval gpt-4o eval-export.jsonl

Docs: https://github.com/openai/evals

OPTION 3: Promptfoo
--------------------------------
npx promptfoo@latest init
npx promptfoo@latest eval

Docs: https://promptfoo.dev/docs

================================================================================
FORMAT INFO
================================================================================

Filesystem format exports each session as a plain text file.
Based on Letta research showing filesystem retrieval outperforms
specialized memory tools for AI agent benchmarks.

Use cases:
- Test RAG systems with file-based retrieval
- Evaluate agents using standard tools (grep, find)
- Human-readable format for manual review

================================================================================
`;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook to manage eval-ready sessions from Pocketbase.
 *
 * @example
 * ```tsx
 * const {
 *   evalSessions,
 *   stats,
 *   allTags,
 *   isLoading,
 *   setEvalReady,
 *   generateExport,
 * } = useEvals({
 *   source: "opencode",
 *   userId: currentUser?.id,
 * });
 * ```
 */
export function useEvals(options: UseEvalsOptions = {}): UseEvalsResult {
  const { source, tags, limit, userId, realtime = false } = options;

  // State
  const [allSessions, setAllSessions] = useState<EvalSession[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refs for cleanup
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const unsubscribeRef = useRef<UnsubscribeFunc | null>(null);

  /**
   * Fetch all eval-ready sessions and compute unique tags.
   */
  const fetchEvalSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Build filter: evalReady = true AND user = userId
      const conditions: string[] = ["evalReady = true"];
      if (userId) {
        conditions.push(`user = "${userId}"`);
      }
      const filter = conditions.join(" && ");

      // Fetch all eval-ready sessions
      const result = await pb
        .collection(Collections.SESSIONS)
        .getList<Session>(1, 1000, {
          filter,
          sort: "-updated",
        });

      // Convert to EvalSession
      const evalSessions = result.items.map(toEvalSession);

      // Collect all unique tags across ALL sessions for filter dropdown
      const tagSet = new Set<string>();
      evalSessions.forEach((s) => {
        s.evalTags?.forEach((tag) => tagSet.add(tag));
      });

      setAllSessions(evalSessions);
      setAllTags(Array.from(tagSet).sort());
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch eval sessions";
      setError(message);
      console.error("useEvals fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // Initial fetch and refetch on userId change
  useEffect(() => {
    fetchEvalSessions();
  }, [fetchEvalSessions]);

  // Realtime subscription
  useEffect(() => {
    if (!realtime) return;

    const subscribe = async () => {
      try {
        unsubscribeRef.current = await pb
          .collection(Collections.SESSIONS)
          .subscribe("*", (e) => {
            // Refetch on changes to eval fields
            if (
              e.action === "create" ||
              e.action === "update" ||
              e.action === "delete"
            ) {
              fetchEvalSessions();
            }
          });
      } catch (err) {
        console.error("Failed to subscribe to sessions for evals:", err);
      }
    };

    subscribe();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [realtime, fetchEvalSessions]);

  // Apply filters (source, tags, limit) to allSessions
  const filteredSessions = useMemo(() => {
    let sessions = allSessions;

    // Filter by source
    if (source) {
      sessions = sessions.filter((s) => s.source === source);
    }

    // Filter by tags (ANY match)
    if (tags && tags.length > 0) {
      sessions = sessions.filter(
        (s) => s.evalTags && tags.some((tag) => s.evalTags!.includes(tag))
      );
    }

    // Apply limit
    if (limit) {
      sessions = sessions.slice(0, limit);
    }

    return sessions;
  }, [allSessions, source, tags, limit]);

  // Compute stats from filtered sessions (but bySource counts all)
  const stats = useMemo(() => computeStats(filteredSessions), [filteredSessions]);

  // ============================================================================
  // Mutations
  // ============================================================================

  /**
   * Mark or unmark a session as eval-ready.
   */
  const setEvalReady = useCallback(
    async (
      sessionId: string,
      evalReady: boolean,
      notes?: string,
      tags?: string[]
    ): Promise<void> => {
      try {
        const updateData: Record<string, unknown> = {
          evalReady,
          reviewedAt: evalReady ? new Date().toISOString() : "",
        };
        if (notes !== undefined) updateData.evalNotes = notes;
        if (tags !== undefined) updateData.evalTags = tags;

        await pb.collection(Collections.SESSIONS).update(sessionId, updateData);

        // Refetch to update state
        await fetchEvalSessions();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to set eval ready";
        console.error("setEvalReady error:", err);
        throw new Error(message);
      }
    },
    [fetchEvalSessions]
  );

  /**
   * Update eval notes for a session.
   */
  const updateEvalNotes = useCallback(
    async (sessionId: string, notes: string): Promise<void> => {
      try {
        await pb.collection(Collections.SESSIONS).update(sessionId, {
          evalNotes: notes,
        });
        await fetchEvalSessions();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update eval notes";
        console.error("updateEvalNotes error:", err);
        throw new Error(message);
      }
    },
    [fetchEvalSessions]
  );

  /**
   * Update eval tags for a session.
   */
  const updateEvalTags = useCallback(
    async (sessionId: string, tags: string[]): Promise<void> => {
      try {
        await pb.collection(Collections.SESSIONS).update(sessionId, {
          evalTags: tags,
        });
        await fetchEvalSessions();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update eval tags";
        console.error("updateEvalTags error:", err);
        throw new Error(message);
      }
    },
    [fetchEvalSessions]
  );

  // ============================================================================
  // Export
  // ============================================================================

  /**
   * Generate eval export in the specified format.
   * Runs fully client-side (fetches sessions + messages, formats, returns).
   */
  const generateExport = useCallback(
    async (
      sessionIds: string[] | "all",
      format: ExportFormat,
      options: ExportOptions
    ): Promise<ExportResult> => {
      try {
        // Determine which sessions to export
        let sessionsToExport: EvalSession[];
        if (sessionIds === "all") {
          sessionsToExport = filteredSessions;
        } else {
          sessionsToExport = filteredSessions.filter((s) =>
            sessionIds.includes(s.id)
          );
        }

        if (sessionsToExport.length === 0) {
          throw new Error("No sessions found for export");
        }

        // Fetch messages for each session
        const messagesBySession: Record<string, Message[]> = {};
        for (const session of sessionsToExport) {
          const messagesResult = await pb
            .collection(Collections.MESSAGES)
            .getList<Message>(1, 1000, {
              filter: `session = "${session.id}"`,
              sort: "created",
            });
          messagesBySession[session.id] = messagesResult.items;
        }

        const timestamp = new Date().toISOString();
        let testCaseCount = 0;

        // Helper to apply anonymization
        const anonymize = (text: string): string => {
          return options.anonymizePaths ? anonymizePaths(text) : text;
        };

        // ====================================================================
        // DeepEval Format
        // ====================================================================
        if (format === "deepeval") {
          type DeepEvalTestCase = {
            input: string;
            actual_output: string;
            expected_output: string;
            context: string[];
            metadata: {
              session_id: string;
              model: string;
              source: string;
              tokens: number;
              timestamp: string;
            };
          };

          const testCases: DeepEvalTestCase[] = [];

          for (const session of sessionsToExport) {
            const messages = messagesBySession[session.id] || [];

            for (let i = 0; i < messages.length; i++) {
              const msg = messages[i];
              if (msg.role === "user" && i + 1 < messages.length) {
                const response = messages[i + 1];
                if (response.role === "assistant") {
                  testCases.push({
                    input: anonymize(msg.textContent || ""),
                    actual_output: anonymize(response.textContent || ""),
                    expected_output: anonymize(response.textContent || ""),
                    context: options.includeToolCalls
                      ? messages
                          .slice(0, i)
                          .map((m) => anonymize(m.textContent || ""))
                      : [],
                    metadata: {
                      session_id: session.externalId,
                      model: session.model || "unknown",
                      source: session.source || "opencode",
                      tokens:
                        (msg.promptTokens || 0) +
                        (response.completionTokens || 0),
                      timestamp: new Date(session.createdAt).toISOString(),
                    },
                  });
                  testCaseCount++;
                }
              }
            }
          }

          return {
            data: JSON.stringify({ test_cases: testCases }, null, 2),
            filename: `eval-export-deepeval-${timestamp.split("T")[0]}.json`,
            stats: { sessions: sessionsToExport.length, testCases: testCaseCount },
          };
        }

        // ====================================================================
        // OpenAI Evals Format
        // ====================================================================
        if (format === "openai") {
          type OpenAIEvalCase = {
            input: Array<{ role: string; content: string }>;
            ideal: string;
            metadata: {
              session_id: string;
              model: string;
              source: string;
            };
          };

          const lines: string[] = [];

          for (const session of sessionsToExport) {
            const messages = messagesBySession[session.id] || [];
            const context: Array<{ role: string; content: string }> = [];

            for (let i = 0; i < messages.length; i++) {
              const msg = messages[i];

              if (msg.role === "system" && !options.includeSystemPrompts)
                continue;

              context.push({
                role: msg.role,
                content: anonymize(msg.textContent || ""),
              });

              if (msg.role === "user" && i + 1 < messages.length) {
                const response = messages[i + 1];
                if (response.role === "assistant") {
                  const evalCase: OpenAIEvalCase = {
                    input: [...context],
                    ideal: anonymize(response.textContent || ""),
                    metadata: {
                      session_id: session.externalId,
                      model: session.model || "unknown",
                      source: session.source || "opencode",
                    },
                  };
                  lines.push(JSON.stringify(evalCase));
                  testCaseCount++;
                }
              }
            }
          }

          return {
            data: lines.join("\n"),
            filename: `eval-export-openai-${timestamp.split("T")[0]}.jsonl`,
            stats: { sessions: sessionsToExport.length, testCases: testCaseCount },
          };
        }

        // ====================================================================
        // Filesystem Format
        // ====================================================================
        const files: Array<{ name: string; content: string }> = [];
        const fileList: string[] = [];

        for (const session of sessionsToExport) {
          const messages = messagesBySession[session.id] || [];
          const lines: string[] = [];

          // Header
          lines.push("=".repeat(80));
          lines.push(`SESSION: ${session.externalId}`);
          lines.push(`SOURCE: ${session.source || "opencode"}`);
          lines.push(`MODEL: ${session.model || "unknown"}`);
          lines.push(`DATE: ${new Date(session.createdAt).toISOString()}`);
          lines.push(`TOKENS: ${session.totalTokens}`);
          if (session.evalTags?.length) {
            lines.push(`TAGS: ${session.evalTags.join(", ")}`);
          }
          lines.push("=".repeat(80));
          lines.push("");

          // Messages
          for (const msg of messages) {
            if (msg.role === "system" && !options.includeSystemPrompts)
              continue;

            const msgTimestamp = new Date(msg.created).toISOString();
            const role = msg.role.toUpperCase();
            lines.push(`[${msgTimestamp}] ${role}:`);
            lines.push(anonymize(msg.textContent || "(empty)"));
            lines.push("");
          }

          lines.push("=".repeat(80));
          lines.push("END SESSION");
          lines.push("=".repeat(80));

          const filename = `session-${session.externalId.slice(0, 8)}.txt`;
          files.push({ name: filename, content: lines.join("\n") });
          fileList.push(filename);
          testCaseCount += messages.filter((m) => m.role === "user").length;
        }

        // Create manifest
        const manifest = {
          export_date: timestamp,
          total_sessions: sessionsToExport.length,
          sources: {
            opencode: sessionsToExport.filter(
              (s) => s.source === "opencode" || !s.source
            ).length,
            "claude-code": sessionsToExport.filter(
              (s) => s.source === "claude-code"
            ).length,
          },
          models: [
            ...new Set(sessionsToExport.map((s) => s.model).filter(Boolean)),
          ],
          files: fileList,
        };

        // Combine all files into a single export
        const exportBundle = {
          manifest,
          files: files.reduce(
            (acc, f) => ({ ...acc, [f.name]: f.content }),
            {} as Record<string, string>
          ),
          readme: generateReadme(sessionsToExport.length, testCaseCount),
        };

        return {
          data: JSON.stringify(exportBundle, null, 2),
          filename: `eval-export-filesystem-${timestamp.split("T")[0]}.json`,
          stats: { sessions: sessionsToExport.length, testCases: testCaseCount },
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to generate export";
        console.error("generateExport error:", err);
        throw new Error(message);
      }
    },
    [filteredSessions]
  );

  return {
    evalSessions: filteredSessions,
    stats,
    allTags,
    isLoading,
    error,
    refetch: fetchEvalSessions,
    setEvalReady,
    updateEvalNotes,
    updateEvalTags,
    generateExport,
  };
}

export default useEvals;
