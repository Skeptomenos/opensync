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
