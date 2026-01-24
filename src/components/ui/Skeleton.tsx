/**
 * Skeleton loading components for displaying shimmer placeholders during data fetches.
 *
 * Uses Tailwind's animate-pulse for shimmer effect.
 * Theme-aware: adapts to dark/tan themes via getThemeClasses.
 */

import { cn } from "../../lib/utils";
import { useTheme, getThemeClasses } from "../../lib/theme";

// ─────────────────────────────────────────────────────────────────────────────
// Base Skeleton
// ─────────────────────────────────────────────────────────────────────────────

interface SkeletonProps {
  className?: string;
  /** Width of the skeleton. Can be Tailwind class or inline style */
  width?: string;
  /** Height of the skeleton. Can be Tailwind class or inline style */
  height?: string;
  /** If true, skeleton is circular */
  circle?: boolean;
}

/**
 * Base skeleton component - a pulsing placeholder block
 */
export function Skeleton({ className, width, height, circle }: SkeletonProps) {
  const { theme } = useTheme();

  return (
    <div
      className={cn(
        "animate-pulse",
        theme === "dark" ? "bg-zinc-800/60" : "bg-[#e6e4e1]",
        circle ? "rounded-full" : "rounded",
        className
      )}
      style={{
        width: width || undefined,
        height: height || undefined,
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton Text
// ─────────────────────────────────────────────────────────────────────────────

interface SkeletonTextProps {
  /** Number of lines to render */
  lines?: number;
  /** Last line width (e.g., "60%") */
  lastLineWidth?: string;
  className?: string;
}

/**
 * Text placeholder skeleton - multiple lines with optional shorter last line
 */
export function SkeletonText({
  lines = 1,
  lastLineWidth = "75%",
  className,
}: SkeletonTextProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-4"
          width={i === lines - 1 && lines > 1 ? lastLineWidth : "100%"}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Session List Skeleton
// ─────────────────────────────────────────────────────────────────────────────

interface SessionSkeletonProps {
  /** Number of session items to show */
  count?: number;
  className?: string;
}

/**
 * Skeleton for session list items (Dashboard, Evals)
 * Matches the layout of session cards with title, meta, and stats
 */
export function SessionSkeleton({ count = 5, className }: SessionSkeletonProps) {
  const { theme } = useTheme();
  const t = getThemeClasses(theme);

  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "p-3 rounded-lg border",
            t.bgSecondary,
            t.border
          )}
        >
          {/* Title row */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <Skeleton className="h-4 flex-1 max-w-[70%]" />
            <Skeleton className="h-4 w-16" />
          </div>
          {/* Meta row (project, model) */}
          <div className="flex items-center gap-2 mb-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
          {/* Stats row (tokens, cost, time) */}
          <div className="flex items-center gap-3">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-14" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats Card Skeleton
// ─────────────────────────────────────────────────────────────────────────────

interface StatsSkeletonProps {
  /** Number of stat cards to show */
  count?: number;
  className?: string;
}

/**
 * Skeleton for analytics stat cards (Dashboard)
 * Matches the layout of stat cards with label and value
 */
export function StatsSkeleton({ count = 4, className }: StatsSkeletonProps) {
  const { theme } = useTheme();
  const t = getThemeClasses(theme);

  return (
    <div className={cn("grid grid-cols-2 md:grid-cols-4 gap-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "p-4 rounded-lg border",
            t.bgSecondary,
            t.border
          )}
        >
          {/* Label */}
          <Skeleton className="h-3 w-20 mb-2" />
          {/* Value */}
          <Skeleton className="h-6 w-16" />
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Table Skeleton
// ─────────────────────────────────────────────────────────────────────────────

interface TableSkeletonProps {
  /** Number of rows */
  rows?: number;
  /** Number of columns */
  columns?: number;
  /** Show header row */
  showHeader?: boolean;
  className?: string;
}

/**
 * Skeleton for table data (Evals, search results)
 */
export function TableSkeleton({
  rows = 5,
  columns = 4,
  showHeader = true,
  className,
}: TableSkeletonProps) {
  const { theme } = useTheme();
  const t = getThemeClasses(theme);

  return (
    <div className={cn("w-full", className)}>
      {showHeader && (
        <div
          className={cn(
            "flex gap-4 p-3 border-b",
            t.bgSecondary,
            t.border
          )}
        >
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
      )}
      <div className="divide-y" style={{ borderColor: "inherit" }}>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className={cn("flex gap-4 p-3", t.divide)}
          >
            {Array.from({ length: columns }).map((_, colIndex) => (
              <Skeleton
                key={colIndex}
                className="h-4 flex-1"
                width={colIndex === 0 ? "40%" : undefined}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart Skeleton
// ─────────────────────────────────────────────────────────────────────────────

interface ChartSkeletonProps {
  /** Height of the chart area */
  height?: string;
  /** Type of chart */
  type?: "bar" | "line" | "pie";
  className?: string;
}

/**
 * Skeleton for chart areas (Dashboard analytics)
 */
export function ChartSkeleton({
  height = "200px",
  type = "bar",
  className,
}: ChartSkeletonProps) {
  const { theme } = useTheme();
  const t = getThemeClasses(theme);

  return (
    <div
      className={cn(
        "p-4 rounded-lg border",
        t.bgSecondary,
        t.border,
        className
      )}
    >
      {/* Chart title */}
      <Skeleton className="h-4 w-32 mb-4" />
      {/* Chart area */}
      <div
        className="relative flex items-end gap-2"
        style={{ height }}
      >
        {type === "bar" && (
          <>
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton
                key={i}
                className="flex-1"
                height={`${30 + Math.random() * 60}%`}
              />
            ))}
          </>
        )}
        {type === "line" && (
          <Skeleton className="w-full h-full" />
        )}
        {type === "pie" && (
          <div className="mx-auto">
            <Skeleton circle className="w-32 h-32" />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Message Skeleton
// ─────────────────────────────────────────────────────────────────────────────

interface MessageSkeletonProps {
  /** Number of messages */
  count?: number;
  className?: string;
}

/**
 * Skeleton for message list (SessionViewer, search results)
 */
export function MessageSkeleton({ count = 3, className }: MessageSkeletonProps) {
  const { theme } = useTheme();
  const t = getThemeClasses(theme);

  return (
    <div className={cn("space-y-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "p-4 rounded-lg border",
            i % 2 === 0 ? t.bgUserBubble : t.bgAssistantBubble,
            t.border
          )}
        >
          {/* Role indicator */}
          <div className="flex items-center gap-2 mb-2">
            <Skeleton circle className="h-5 w-5" />
            <Skeleton className="h-3 w-16" />
          </div>
          {/* Message content */}
          <SkeletonText lines={i % 2 === 0 ? 2 : 4} lastLineWidth="60%" />
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Full Page Skeleton
// ─────────────────────────────────────────────────────────────────────────────

interface PageSkeletonProps {
  /** Page type for layout hints */
  type?: "dashboard" | "settings" | "context" | "evals" | "session";
  className?: string;
}

/**
 * Full page skeleton for initial page load
 */
export function PageSkeleton({ type = "dashboard", className }: PageSkeletonProps) {
  const { theme } = useTheme();
  const t = getThemeClasses(theme);

  return (
    <div className={cn("p-6 space-y-6", className)}>
      {/* Page header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>

      {type === "dashboard" && (
        <>
          <StatsSkeleton count={4} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartSkeleton type="bar" />
            <ChartSkeleton type="bar" />
          </div>
          <SessionSkeleton count={5} />
        </>
      )}

      {type === "settings" && (
        <>
          <div className={cn("p-6 rounded-lg border space-y-4", t.bgSecondary, t.border)}>
            <Skeleton className="h-5 w-32" />
            <SkeletonText lines={2} />
            <Skeleton className="h-10 w-40" />
          </div>
          <div className={cn("p-6 rounded-lg border space-y-4", t.bgSecondary, t.border)}>
            <Skeleton className="h-5 w-24" />
            <SkeletonText lines={3} />
          </div>
        </>
      )}

      {type === "context" && (
        <>
          <div className="flex gap-4">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 w-32" />
          </div>
          <SessionSkeleton count={8} />
        </>
      )}

      {type === "evals" && (
        <>
          <StatsSkeleton count={3} />
          <TableSkeleton rows={6} columns={5} />
        </>
      )}

      {type === "session" && (
        <>
          <div className={cn("p-4 rounded-lg border", t.bgSecondary, t.border)}>
            <Skeleton className="h-6 w-64 mb-2" />
            <div className="flex gap-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
          <MessageSkeleton count={4} />
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

export {
  type SkeletonProps,
  type SkeletonTextProps,
  type SessionSkeletonProps,
  type StatsSkeletonProps,
  type TableSkeletonProps,
  type ChartSkeletonProps,
  type MessageSkeletonProps,
  type PageSkeletonProps,
};
