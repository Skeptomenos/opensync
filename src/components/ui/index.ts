/**
 * UI Components Index
 *
 * Reusable UI components for the OpenSync dashboard.
 * These are low-level primitives used by page components.
 */

// Skeleton loading components
export {
  Skeleton,
  SkeletonText,
  SessionSkeleton,
  StatsSkeleton,
  TableSkeleton,
  ChartSkeleton,
  MessageSkeleton,
  PageSkeleton,
  type SkeletonProps,
  type SkeletonTextProps,
  type SessionSkeletonProps,
  type StatsSkeletonProps,
  type TableSkeletonProps,
  type ChartSkeletonProps,
  type MessageSkeletonProps,
  type PageSkeletonProps,
} from "./Skeleton";

// Error display components
export {
  ErrorFallback,
  ErrorAlert,
  ErrorCard,
  ConnectionError,
  type ErrorFallbackProps,
  type ErrorAlertProps,
  type ErrorCardProps,
  type ConnectionErrorProps,
} from "./Error";
