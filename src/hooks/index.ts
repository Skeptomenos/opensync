/**
 * Pocketbase Data Hooks
 *
 * These hooks provide React-friendly access to Pocketbase collections.
 * They replace Convex useQuery/useMutation hooks from the previous implementation.
 */

export { useSessions, inferProvider } from "./useSessions";
export type {
  UseSessionsOptions,
  UseSessionsResult,
  SortField,
  SortOrder,
} from "./useSessions";

export { useSession } from "./useSession";
export type {
  UseSessionOptions,
  UseSessionResult,
  SessionMessage,
  SessionWithMessages,
} from "./useSession";

export { useMessages } from "./useMessages";
export type {
  UseMessagesOptions,
  UseMessagesResult,
  MessageWithParts,
} from "./useMessages";

export { useUser } from "./useUser";
export type {
  UseUserOptions,
  UseUserResult,
  UserStats,
  DeleteResult,
} from "./useUser";

export { useSearchSessions, useSearchMessages } from "./useSearch";
export type {
  SearchMode,
  SessionSearchResult,
  MessageSearchResult,
  SessionSearchResults,
  MessageSearchResults,
  UseSearchSessionsOptions,
  UseSearchMessagesOptions,
  UseSearchSessionsResult,
  UseSearchMessagesResult,
} from "./useSearch";

export { useAnalytics } from "./useAnalytics";
export type {
  SummaryStats,
  DailyStats,
  ModelStats,
  ProjectStats,
  ProviderStats,
  SourceStats,
  UseAnalyticsOptions,
  UseAnalyticsResult,
} from "./useAnalytics";

export { useEvals } from "./useEvals";
export type {
  EvalSession,
  EvalStats,
  ExportFormat,
  ExportOptions,
  ExportResult,
  UseEvalsOptions,
  UseEvalsResult,
} from "./useEvals";
