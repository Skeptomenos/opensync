/**
 * useAnalytics Hook - Client-side analytics computation from Pocketbase
 *
 * Strategy: Single fetch of all sessions, compute all stats client-side.
 * This avoids multiple round-trips and works well for datasets < 10k sessions.
 *
 * Replaces Convex queries:
 * - api.analytics.summaryStats
 * - api.analytics.dailyStats
 * - api.analytics.modelStats
 * - api.analytics.projectStats
 * - api.analytics.providerStats
 * - api.analytics.sourceStats
 *
 * @see ralph-wiggum/specs/POCKETBASE_MIGRATION.md - Migration spec
 * @see convex/analytics.ts - Original Convex implementation
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { pb } from "../lib/pocketbase";
import {
  Collections,
  type Session,
  type SessionSource,
} from "../lib/types";
import { inferProvider } from "./useSessions";
import type { UnsubscribeFunc } from "pocketbase";

// ============================================================================
// Types
// ============================================================================

/**
 * Summary statistics for dashboard header.
 * Matches Convex api.analytics.summaryStats return type.
 */
export interface SummaryStats {
  totalSessions: number;
  totalMessages: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
  totalDurationMs: number;
  uniqueModels: number;
  uniqueProjects: number;
  avgTokensPerSession: number;
  avgCostPerSession: number;
}

/**
 * Daily usage statistics for charts.
 * Matches Convex api.analytics.dailyStats return type.
 */
export interface DailyStats {
  date: string; // "YYYY-MM-DD"
  sessions: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  durationMs: number;
}

/**
 * Model usage breakdown.
 * Matches Convex api.analytics.modelStats return type.
 */
export interface ModelStats {
  model: string;
  sessions: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  avgDurationMs: number;
}

/**
 * Project usage breakdown.
 * Matches Convex api.analytics.projectStats return type.
 */
export interface ProjectStats {
  project: string;
  sessions: number;
  messageCount: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  totalDurationMs: number;
  cost: number;
  lastActive: number; // timestamp in ms
}

/**
 * Provider usage breakdown.
 * Matches Convex api.analytics.providerStats return type.
 */
export interface ProviderStats {
  provider: string;
  sessions: number;
  totalTokens: number;
  cost: number;
}

/**
 * Source distribution stats (OpenCode vs Claude Code).
 * Matches Convex api.analytics.sourceStats return type.
 */
export interface SourceStats {
  source: string;
  sessions: number;
  totalTokens: number;
  cost: number;
}

/**
 * Hook options.
 */
export interface UseAnalyticsOptions {
  /** Filter by source ("opencode", "claude-code") - undefined means all */
  source?: string;
  /** Number of days for dailyStats (default: 30) */
  days?: number;
  /** User ID to filter by (required in multi-user mode) */
  userId?: string;
  /** Enable realtime updates */
  realtime?: boolean;
}

/**
 * Hook result containing all computed analytics.
 */
export interface UseAnalyticsResult {
  // Computed statistics
  summaryStats: SummaryStats | null;
  dailyStats: DailyStats[];
  modelStats: ModelStats[];
  projectStats: ProjectStats[];
  providerStats: ProviderStats[];
  sourceStats: SourceStats[];

  // State
  isLoading: boolean;
  error: string | null;

  // Actions
  refetch: () => Promise<void>;
}

// ============================================================================
// Computation Functions
// ============================================================================

/**
 * Filter sessions by source.
 * Treats null/undefined source as "opencode" for backward compatibility.
 */
function filterBySource(sessions: Session[], source?: string): Session[] {
  if (!source) return sessions;
  return sessions.filter((s) => (s.source || "opencode") === source);
}

/**
 * Compute summary statistics from sessions.
 */
function computeSummaryStats(sessions: Session[]): SummaryStats {
  const uniqueModels = new Set<string>();
  const uniqueProjects = new Set<string>();

  let totalMessages = 0;
  let totalTokens = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalCost = 0;
  let totalDurationMs = 0;

  for (const session of sessions) {
    totalMessages += session.messageCount || 0;
    totalTokens += session.totalTokens || 0;
    promptTokens += session.promptTokens || 0;
    completionTokens += session.completionTokens || 0;
    totalCost += session.cost || 0;
    totalDurationMs += session.durationMs || 0;

    if (session.model) uniqueModels.add(session.model);
    if (session.projectName) uniqueProjects.add(session.projectName);
  }

  const totalSessions = sessions.length;
  const avgTokensPerSession = totalSessions > 0 ? totalTokens / totalSessions : 0;
  const avgCostPerSession = totalSessions > 0 ? totalCost / totalSessions : 0;

  return {
    totalSessions,
    totalMessages,
    totalTokens,
    promptTokens,
    completionTokens,
    totalCost,
    totalDurationMs,
    uniqueModels: uniqueModels.size,
    uniqueProjects: uniqueProjects.size,
    avgTokensPerSession,
    avgCostPerSession,
  };
}

/**
 * Compute daily statistics from sessions.
 */
function computeDailyStats(sessions: Session[], days: number): DailyStats[] {
  const byDate: Record<
    string,
    {
      sessions: number;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      cost: number;
      durationMs: number;
    }
  > = {};

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  for (const session of sessions) {
    // Use created field (ISO string) for date
    const createdAt = new Date(session.created).getTime();
    if (createdAt < cutoff) continue;

    const date = session.created.split("T")[0];
    if (!byDate[date]) {
      byDate[date] = {
        sessions: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cost: 0,
        durationMs: 0,
      };
    }
    byDate[date].sessions += 1;
    byDate[date].promptTokens += session.promptTokens || 0;
    byDate[date].completionTokens += session.completionTokens || 0;
    byDate[date].totalTokens += session.totalTokens || 0;
    byDate[date].cost += session.cost || 0;
    byDate[date].durationMs += session.durationMs || 0;
  }

  return Object.entries(byDate)
    .map(([date, stats]) => ({ date, ...stats }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Compute model statistics from sessions.
 */
function computeModelStats(sessions: Session[]): ModelStats[] {
  const byModel: Record<
    string,
    {
      sessions: number;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      cost: number;
      totalDurationMs: number;
    }
  > = {};

  for (const session of sessions) {
    const model = session.model || "unknown";
    if (!byModel[model]) {
      byModel[model] = {
        sessions: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cost: 0,
        totalDurationMs: 0,
      };
    }
    byModel[model].sessions += 1;
    byModel[model].promptTokens += session.promptTokens || 0;
    byModel[model].completionTokens += session.completionTokens || 0;
    byModel[model].totalTokens += session.totalTokens || 0;
    byModel[model].cost += session.cost || 0;
    byModel[model].totalDurationMs += session.durationMs || 0;
  }

  return Object.entries(byModel)
    .map(([model, stats]) => ({
      model,
      sessions: stats.sessions,
      promptTokens: stats.promptTokens,
      completionTokens: stats.completionTokens,
      totalTokens: stats.totalTokens,
      cost: stats.cost,
      avgDurationMs: stats.sessions > 0 ? stats.totalDurationMs / stats.sessions : 0,
    }))
    .sort((a, b) => b.sessions - a.sessions);
}

/**
 * Compute project statistics from sessions.
 */
function computeProjectStats(sessions: Session[]): ProjectStats[] {
  const byProject: Record<
    string,
    {
      sessions: number;
      messageCount: number;
      totalTokens: number;
      promptTokens: number;
      completionTokens: number;
      totalDurationMs: number;
      cost: number;
      lastActive: number;
    }
  > = {};

  for (const session of sessions) {
    const project = session.projectName || session.projectPath || "unknown";
    const updatedAt = new Date(session.updated).getTime();

    if (!byProject[project]) {
      byProject[project] = {
        sessions: 0,
        messageCount: 0,
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalDurationMs: 0,
        cost: 0,
        lastActive: 0,
      };
    }
    byProject[project].sessions += 1;
    byProject[project].messageCount += session.messageCount || 0;
    byProject[project].totalTokens += session.totalTokens || 0;
    byProject[project].promptTokens += session.promptTokens || 0;
    byProject[project].completionTokens += session.completionTokens || 0;
    byProject[project].totalDurationMs += session.durationMs || 0;
    byProject[project].cost += session.cost || 0;
    byProject[project].lastActive = Math.max(byProject[project].lastActive, updatedAt);
  }

  return Object.entries(byProject)
    .map(([project, stats]) => ({ project, ...stats }))
    .sort((a, b) => b.lastActive - a.lastActive);
}

/**
 * Compute provider statistics from sessions.
 * Uses inferProvider to handle missing provider field.
 */
function computeProviderStats(sessions: Session[]): ProviderStats[] {
  const byProvider: Record<
    string,
    {
      sessions: number;
      totalTokens: number;
      cost: number;
    }
  > = {};

  for (const session of sessions) {
    const provider = inferProvider(session);
    if (!byProvider[provider]) {
      byProvider[provider] = {
        sessions: 0,
        totalTokens: 0,
        cost: 0,
      };
    }
    byProvider[provider].sessions += 1;
    byProvider[provider].totalTokens += session.totalTokens || 0;
    byProvider[provider].cost += session.cost || 0;
  }

  return Object.entries(byProvider)
    .map(([provider, stats]) => ({ provider, ...stats }))
    .sort((a, b) => b.sessions - a.sessions);
}

/**
 * Compute source distribution statistics.
 * Does NOT filter by source - always shows all sources.
 */
function computeSourceStats(sessions: Session[]): SourceStats[] {
  const bySource: Record<
    string,
    {
      sessions: number;
      totalTokens: number;
      cost: number;
    }
  > = {};

  for (const session of sessions) {
    // Treat null/undefined as "opencode" for backward compatibility
    const source = session.source || "opencode";
    if (!bySource[source]) {
      bySource[source] = {
        sessions: 0,
        totalTokens: 0,
        cost: 0,
      };
    }
    bySource[source].sessions += 1;
    bySource[source].totalTokens += session.totalTokens || 0;
    bySource[source].cost += session.cost || 0;
  }

  return Object.entries(bySource)
    .map(([source, stats]) => ({ source, ...stats }))
    .sort((a, b) => b.sessions - a.sessions);
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook to fetch all sessions and compute analytics client-side.
 *
 * Design: Single fetch, multiple computations. This approach:
 * 1. Minimizes round-trips to Pocketbase
 * 2. Enables fast re-computation when filters change
 * 3. Works well for single-user datasets (< 10k sessions)
 *
 * @example
 * ```tsx
 * const {
 *   summaryStats,
 *   dailyStats,
 *   modelStats,
 *   projectStats,
 *   providerStats,
 *   sourceStats,
 *   isLoading,
 *   error,
 * } = useAnalytics({
 *   source: "opencode",
 *   days: 30,
 *   userId: currentUser?.id,
 * });
 * ```
 */
export function useAnalytics(options: UseAnalyticsOptions = {}): UseAnalyticsResult {
  const { source, days = 30, userId, realtime = false } = options;

  // Raw sessions from Pocketbase (all of them)
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track options to avoid stale closures
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Unsubscribe function for realtime
  const unsubscribeRef = useRef<UnsubscribeFunc | null>(null);

  /**
   * Fetch all sessions for the user.
   * Pocketbase limits: fetches in batches of 500 until all are retrieved.
   */
  const fetchAllSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const allItems: Session[] = [];
      let page = 1;
      const perPage = 500;
      let hasMore = true;

      // Build user filter if provided
      const filter = userId ? `user = "${userId}"` : undefined;

      while (hasMore) {
        const result = await pb
          .collection(Collections.SESSIONS)
          .getList<Session>(page, perPage, {
            filter,
            sort: "-created",
          });

        allItems.push(...result.items);
        hasMore = result.page < result.totalPages;
        page++;
      }

      // Process sessions: normalize source field
      const processed = allItems.map((s) => ({
        ...s,
        source: (s.source || "opencode") as SessionSource,
      }));

      setAllSessions(processed);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch sessions for analytics";
      setError(message);
      console.error("useAnalytics fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // Initial fetch
  useEffect(() => {
    fetchAllSessions();
  }, [fetchAllSessions]);

  // Realtime subscription
  useEffect(() => {
    if (!realtime) return;

    const subscribe = async () => {
      try {
        unsubscribeRef.current = await pb
          .collection(Collections.SESSIONS)
          .subscribe("*", (e) => {
            // Refetch on any change
            if (e.action === "create" || e.action === "update" || e.action === "delete") {
              fetchAllSessions();
            }
          });
      } catch (err) {
        console.error("Failed to subscribe to sessions for analytics:", err);
      }
    };

    subscribe();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [realtime, fetchAllSessions]);

  // Compute all stats from allSessions when source/days change
  const filteredSessions = useMemo(
    () => filterBySource(allSessions, source),
    [allSessions, source]
  );

  const summaryStats = useMemo(
    () => (filteredSessions.length > 0 ? computeSummaryStats(filteredSessions) : null),
    [filteredSessions]
  );

  const dailyStats = useMemo(
    () => computeDailyStats(filteredSessions, days),
    [filteredSessions, days]
  );

  const modelStats = useMemo(() => computeModelStats(filteredSessions), [filteredSessions]);

  const projectStats = useMemo(
    () => computeProjectStats(filteredSessions),
    [filteredSessions]
  );

  const providerStats = useMemo(
    () => computeProviderStats(filteredSessions),
    [filteredSessions]
  );

  // sourceStats uses ALL sessions (not filtered by source)
  const sourceStats = useMemo(() => computeSourceStats(allSessions), [allSessions]);

  return {
    summaryStats,
    dailyStats,
    modelStats,
    projectStats,
    providerStats,
    sourceStats,
    isLoading,
    error,
    refetch: fetchAllSessions,
  };
}

export default useAnalytics;
