/**
 * Type definitions for Pocketbase collections
 *
 * These types mirror the Pocketbase schema exactly. They are the single source
 * of truth for data structures used throughout the app.
 *
 * Schema Reference:
 * - pb_migrations/1769261559_updated_users.js - Users collection
 * - pb_migrations/1769261723_created_sessions.js - Sessions collection
 * - pb_migrations/1769262312_created_messages.js - Messages collection
 * - pb_migrations/1769262695_created_parts.js - Parts collection
 * - pb_migrations/1769262938_created_apiLogs.js - ApiLogs collection
 */

// ============================================================================
// Base Types
// ============================================================================

/**
 * Base record type with common fields from Pocketbase.
 * All collection records extend this.
 */
export interface BaseRecord {
  id: string;
  created: string; // ISO date string
  updated: string; // ISO date string
}

// ============================================================================
// Users Collection (extends Pocketbase auth collection)
// ============================================================================

/**
 * User record from the _pb_users_auth_ collection.
 * Extends the built-in Pocketbase auth collection with custom fields.
 */
export interface PocketbaseUser extends BaseRecord {
  // Standard Pocketbase auth fields
  email: string;
  name: string;
  avatar: string; // Pocketbase file field (filename)
  verified: boolean;

  // Custom fields added via migration 1769261559
  autheliaId: string; // SSO integration identifier
  avatarUrl: string; // External avatar URL (e.g., from OAuth provider)
  profilePhotoId: string; // Max 255 chars
  apiKey: string; // Max 64 chars, indexed
  apiKeyCreatedAt: number; // Timestamp
  enabledAgents: string[]; // JSON array of enabled agent identifiers
}

/**
 * User type used in the UI context.
 * Includes derived fields for compatibility with existing components.
 *
 * Note: firstName/lastName are derived from the single `name` field.
 * This maintains backward compatibility with UI components that expect
 * these fields from the previous WorkOS integration.
 */
export interface User {
  id: string;
  email: string;
  name?: string;
  groups?: string[]; // From Authelia headers

  // Derived fields for UI compatibility
  firstName?: string; // Derived: first part of name
  lastName?: string; // Derived: rest of name after first space

  // Avatar fields
  profilePictureUrl?: string; // Maps from avatarUrl or OAuth avatar

  // Pocketbase-specific fields (available after user sync)
  autheliaId?: string;
  apiKey?: string;
  apiKeyCreatedAt?: number;
  enabledAgents?: string[];
}

/**
 * Helper to derive User from PocketbaseUser or auth context.
 * Splits `name` into firstName/lastName for UI compatibility.
 */
export function toUser(
  source:
    | PocketbaseUser
    | { email: string; name?: string; groups?: string[] }
): User {
  const name = source.name || "";
  const nameParts = name.trim().split(/\s+/);
  const firstName = nameParts[0] || undefined;
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : undefined;

  // Base user from any source
  const user: User = {
    id: "id" in source ? source.id : source.email, // Use PB id or email as fallback
    email: source.email,
    name: source.name || undefined,
    firstName,
    lastName,
  };

  // Add groups if from auth context
  if ("groups" in source && source.groups) {
    user.groups = source.groups;
  }

  // Add Pocketbase-specific fields if from PocketbaseUser
  if ("autheliaId" in source) {
    const pbUser = source as PocketbaseUser;
    user.autheliaId = pbUser.autheliaId || undefined;
    user.profilePictureUrl = pbUser.avatarUrl || undefined;
    user.apiKey = pbUser.apiKey || undefined;
    user.apiKeyCreatedAt = pbUser.apiKeyCreatedAt || undefined;
    user.enabledAgents = pbUser.enabledAgents || undefined;
  }

  return user;
}

// ============================================================================
// Sessions Collection
// ============================================================================

/**
 * Source of the coding session (which tool created it).
 */
export type SessionSource = "opencode" | "claude-code" | "unknown";

/**
 * Session record from the sessions collection.
 */
export interface Session extends BaseRecord {
  // Relations
  user: string; // FK to users collection

  // Identity
  externalId: string; // Unique identifier from sync plugin (required)
  title: string;
  projectPath: string;
  projectName: string;

  // Model info
  model: string;
  provider: string;
  source: SessionSource;

  // Token usage
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number; // Float, in USD

  // Timing
  durationMs: number;

  // Visibility
  isPublic: boolean;
  publicSlug: string;

  // Search & summary
  searchableText: string; // Full-text search content
  summary: string; // Max 5000 chars

  // Message count
  messageCount: number;

  // Eval fields
  evalReady: boolean;
  reviewedAt: string; // ISO date string or empty
  evalNotes: string; // Max 5000 chars
  evalTags: string[]; // JSON array
}

/**
 * Session with expanded relations.
 * Used when fetching sessions with user data.
 */
export interface SessionWithUser extends Session {
  expand?: {
    user?: PocketbaseUser;
  };
}

/**
 * Create session input (for sync API).
 */
export interface CreateSessionInput {
  externalId: string;
  title?: string;
  projectPath?: string;
  projectName?: string;
  model?: string;
  provider?: string;
  source?: SessionSource;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cost?: number;
  durationMs?: number;
}

/**
 * Update session input.
 */
export interface UpdateSessionInput {
  title?: string;
  isPublic?: boolean;
  publicSlug?: string;
  summary?: string;
  evalReady?: boolean;
  evalNotes?: string;
  evalTags?: string[];
  reviewedAt?: string;
}

// ============================================================================
// Messages Collection
// ============================================================================

/**
 * Message role within a session.
 */
export type MessageRole = "user" | "assistant" | "system" | "unknown";

/**
 * Message record from the messages collection.
 */
export interface Message extends BaseRecord {
  // Relations
  session: string; // FK to sessions collection

  // Identity
  externalId: string; // Unique identifier from sync plugin (required)

  // Content
  role: MessageRole;
  textContent: string; // Main text content of the message

  // Model info (for assistant messages)
  model: string;

  // Token usage (for assistant messages)
  promptTokens: number;
  completionTokens: number;

  // Timing
  durationMs: number;
}

/**
 * Message with expanded relations.
 */
export interface MessageWithSession extends Message {
  expand?: {
    session?: Session;
  };
}

/**
 * Message with parts expanded.
 */
export interface MessageWithParts extends Message {
  expand?: {
    parts_via_message?: Part[];
  };
}

/**
 * Create message input (for sync API).
 */
export interface CreateMessageInput {
  session: string; // Session ID
  externalId: string;
  role: MessageRole;
  textContent?: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  durationMs?: number;
}

// ============================================================================
// Parts Collection
// ============================================================================

/**
 * Type of message part.
 */
export type PartType = "text" | "tool_call" | "tool_result" | "code_block";

/**
 * Base content structure for parts.
 * The actual content depends on the part type.
 */
export interface PartContentBase {
  [key: string]: unknown;
}

/**
 * Text part content.
 */
export interface TextPartContent extends PartContentBase {
  text: string;
}

/**
 * Tool call part content.
 */
export interface ToolCallPartContent extends PartContentBase {
  toolName: string;
  toolCallId: string;
  args: Record<string, unknown>;
}

/**
 * Tool result part content.
 */
export interface ToolResultPartContent extends PartContentBase {
  toolCallId: string;
  result: unknown;
  isError?: boolean;
}

/**
 * Code block part content.
 */
export interface CodeBlockPartContent extends PartContentBase {
  language: string;
  code: string;
  filename?: string;
}

/**
 * Union of all part content types.
 */
export type PartContent =
  | TextPartContent
  | ToolCallPartContent
  | ToolResultPartContent
  | CodeBlockPartContent
  | PartContentBase;

/**
 * Part record from the parts collection.
 */
export interface Part extends BaseRecord {
  // Relations
  message: string; // FK to messages collection

  // Content
  type: PartType;
  content: PartContent; // JSON blob, structure depends on type

  // Ordering
  order: number; // Position within the message
}

/**
 * Part with expanded message relation.
 */
export interface PartWithMessage extends Part {
  expand?: {
    message?: Message;
  };
}

/**
 * Create part input (for sync API).
 */
export interface CreatePartInput {
  message: string; // Message ID
  type: PartType;
  content: PartContent;
  order: number;
}

// ============================================================================
// API Logs Collection
// ============================================================================

/**
 * HTTP method for API logs.
 */
export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

/**
 * API log record from the apiLogs collection.
 */
export interface ApiLog extends BaseRecord {
  // Relations
  user: string; // FK to users collection

  // Request info
  endpoint: string; // Max 500 chars
  method: HttpMethod;

  // Response info
  statusCode: number; // 100-599
  responseTimeMs: number;
}

/**
 * API log with expanded user relation.
 */
export interface ApiLogWithUser extends ApiLog {
  expand?: {
    user?: PocketbaseUser;
  };
}

// ============================================================================
// Deferred: Embedding Collections (for vector search)
// ============================================================================

/**
 * Session embedding record (deferred to post-MVP).
 */
export interface SessionEmbedding extends BaseRecord {
  session: string; // FK to sessions
  embedding: number[]; // 1536-dimension vector
}

/**
 * Message embedding record (deferred to post-MVP).
 */
export interface MessageEmbedding extends BaseRecord {
  message: string; // FK to messages
  embedding: number[]; // 1536-dimension vector
}

// ============================================================================
// Collection Names (for Pocketbase SDK)
// ============================================================================

/**
 * Collection name constants for type-safe Pocketbase queries.
 */
export const Collections = {
  USERS: "users",
  SESSIONS: "sessions",
  MESSAGES: "messages",
  PARTS: "parts",
  API_LOGS: "apiLogs",
  SESSION_EMBEDDINGS: "sessionEmbeddings",
  MESSAGE_EMBEDDINGS: "messageEmbeddings",
} as const;

export type CollectionName = (typeof Collections)[keyof typeof Collections];

// ============================================================================
// Query/Filter Types
// ============================================================================

/**
 * Pagination options for list queries.
 */
export interface PaginationOptions {
  page?: number;
  perPage?: number;
}

/**
 * Sort options for list queries.
 */
export interface SortOptions {
  sort?: string; // e.g., "-created" for descending, "created" for ascending
}

/**
 * Common list query options.
 */
export interface ListOptions extends PaginationOptions, SortOptions {
  filter?: string; // Pocketbase filter expression
  expand?: string; // Relations to expand
}

/**
 * Paginated response from Pocketbase.
 */
export interface PaginatedResponse<T> {
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  items: T[];
}

// ============================================================================
// Analytics Types
// ============================================================================

/**
 * Summary statistics for the dashboard.
 */
export interface SummaryStats {
  totalSessions: number;
  totalMessages: number;
  totalTokens: number;
  totalCost: number;
  avgSessionDuration: number;
  avgTokensPerSession: number;
}

/**
 * Daily usage statistics.
 */
export interface DailyStats {
  date: string; // YYYY-MM-DD
  sessions: number;
  messages: number;
  tokens: number;
  cost: number;
}

/**
 * Model usage statistics.
 */
export interface ModelStats {
  model: string;
  sessions: number;
  tokens: number;
  cost: number;
}

/**
 * Project usage statistics.
 */
export interface ProjectStats {
  projectName: string;
  sessions: number;
  tokens: number;
  cost: number;
}

/**
 * Provider usage statistics.
 */
export interface ProviderStats {
  provider: string;
  sessions: number;
  tokens: number;
  cost: number;
}

/**
 * Source (tool) usage statistics.
 */
export interface SourceStats {
  source: SessionSource;
  sessions: number;
  tokens: number;
  cost: number;
}
