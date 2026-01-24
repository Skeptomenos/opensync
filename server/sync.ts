/**
 * Sync API Endpoints for OpenSync Plugin
 *
 * These endpoints handle session and message sync from the opencode-sync and
 * claude-code-sync plugins. They implement the same API contract as the
 * original Convex HTTP endpoints (convex/http.ts).
 *
 * Endpoints:
 * - POST /sync/session - Upsert a single session
 * - POST /sync/message - Upsert a single message with parts
 * - POST /sync/batch - Batch upsert sessions and messages
 * - GET /sync/sessions/list - List all session external IDs for user
 *
 * Authentication:
 * - Bearer osk_* API keys (validated against users.apiKey)
 */

import type { IncomingMessage, ServerResponse } from "http";
import PocketBase from "pocketbase";

// ============================================================================
// Types
// ============================================================================

interface SyncUser {
  id: string;
  email: string;
  apiKey: string;
}

interface SessionInput {
  externalId?: string;
  sessionId?: string; // Alias for externalId (claude-code compatibility)
  title?: string;
  projectPath?: string;
  projectName?: string;
  model?: string;
  provider?: string;
  source?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cost?: number;
  durationMs?: number;
}

interface MessageInput {
  sessionExternalId: string;
  externalId: string;
  role: "user" | "assistant" | "system" | "unknown";
  textContent?: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  durationMs?: number;
  source?: string;
  parts?: Array<{ type: string; content: unknown }>;
}

interface BatchInput {
  sessions?: SessionInput[];
  messages?: MessageInput[];
}

// ============================================================================
// Pocketbase Client with Admin Auth
// ============================================================================

// Use the same Pocketbase URL as the frontend
const POCKETBASE_URL = process.env.VITE_POCKETBASE_URL || "http://localhost:8090";

// Admin credentials for server-side operations
const ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD || "admin123456";

// Cached admin-authenticated client
let adminClient: PocketBase | null = null;
let adminAuthExpiry = 0;

/**
 * Get an admin-authenticated Pocketbase client.
 *
 * WHY: The sync endpoints need to look up users by API key, which requires
 * admin-level access since the users collection has restricted list rules.
 * We cache the admin auth to avoid re-authenticating on every request.
 *
 * NOTE: In PocketBase v0.21+, admins are now "superusers" and use
 * collection('_superusers').authWithPassword() instead of admins.authWithPassword()
 */
async function getAdminClient(): Promise<PocketBase> {
  const now = Date.now();

  // Refresh if expired or not authenticated (1 hour buffer before token expiry)
  if (!adminClient || now >= adminAuthExpiry) {
    const pb = new PocketBase(POCKETBASE_URL);

    try {
      // PocketBase v0.21+ uses _superusers collection for admin auth
      await pb.collection("_superusers").authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
      adminClient = pb;
      // Set expiry to 1 hour from now (tokens last longer but we refresh early)
      adminAuthExpiry = now + 60 * 60 * 1000;
    } catch (e) {
      throw new Error(
        `Superuser auth failed. Ensure POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD ` +
        `are set correctly in .env.local, and that a superuser with those credentials exists. ` +
        `Create one at http://localhost:8090/_/. Error: ${e}`
      );
    }
  }

  return adminClient;
}

// ============================================================================
// Authentication
// ============================================================================

/**
 * Validate API key from Authorization header.
 * Uses admin authentication to look up the user by API key.
 * Returns the user record or error.
 */
async function validateApiKey(
  authHeader: string | undefined
): Promise<{ pb: PocketBase; user: SyncUser } | { error: string; status: number }> {
  if (!authHeader?.startsWith("Bearer osk_") && !authHeader?.startsWith("Bearer os_")) {
    return { error: "Invalid API key format. Expected 'Bearer osk_*' or 'Bearer os_*'", status: 401 };
  }

  const apiKey = authHeader.slice(7); // Remove "Bearer "

  try {
    const pb = await getAdminClient();

    // Find user by API key (admin auth allows this query)
    const user = await pb.collection("users").getFirstListItem<SyncUser>(
      `apiKey = "${apiKey}"`
    );

    if (!user) {
      return { error: "Invalid API key", status: 401 };
    }

    return { pb, user };
  } catch (e) {
    // getFirstListItem throws if not found
    // PocketBase SDK throws ClientResponseError with status 404 when not found
    const errorMsg = (e as Error).message || String(e);
    const errorStatus = (e as { status?: number }).status;

    // Check for various "not found" error patterns
    if (
      errorStatus === 404 ||
      errorMsg.includes("couldn't find") ||
      errorMsg.includes("not found") ||
      errorMsg.includes("wasn't found")
    ) {
      return { error: "Invalid API key", status: 401 };
    }
    return { error: `API key validation failed: ${e}`, status: 500 };
  }
}

// ============================================================================
// Request/Response Helpers
// ============================================================================

/**
 * Parse JSON body from request.
 */
function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error(`Invalid JSON: ${e}`));
      }
    });
    req.on("error", reject);
  });
}

/**
 * Send JSON response.
 */
function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.end(JSON.stringify(data));
}

/**
 * Send CORS preflight response.
 */
function sendCorsPrelight(res: ServerResponse): void {
  res.statusCode = 204;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.end();
}

// ============================================================================
// Session Upsert Logic
// ============================================================================

// Define a minimal session record type for upsertSession
interface ExistingSession {
  id: string;
  promptTokens: number;
  completionTokens: number;
}

/**
 * Upsert a session - create if not exists, update if exists.
 * Uses user + externalId as the unique key.
 *
 * WHY: Sessions may be synced multiple times (on every save, on exit, etc.)
 * and we need to dedupe by externalId while preserving the original session.
 */
async function upsertSession(
  pb: PocketBase,
  userId: string,
  input: SessionInput
): Promise<{ sessionId: string; created: boolean }> {
  const externalId = input.externalId || input.sessionId;
  if (!externalId) {
    throw new Error("Missing externalId or sessionId");
  }

  // Try to find existing session by user + externalId
  let existing: ExistingSession | null = null;
  try {
    existing = await pb.collection("sessions").getFirstListItem<ExistingSession>(
      `user = "${userId}" && externalId = "${externalId}"`
    );
  } catch {
    // Not found - will create
  }

  const sessionData = {
    user: userId,
    externalId,
    title: input.title || "",
    projectPath: input.projectPath || "",
    projectName: input.projectName || "",
    model: input.model || "",
    provider: input.provider || "",
    source: input.source || "unknown",
    promptTokens: input.promptTokens || 0,
    completionTokens: input.completionTokens || 0,
    totalTokens: input.totalTokens || input.promptTokens && input.completionTokens
      ? (input.promptTokens || 0) + (input.completionTokens || 0)
      : 0,
    cost: input.cost || 0,
    durationMs: input.durationMs || 0,
    // Defaults for new sessions
    isPublic: false,
    messageCount: 0,
    evalReady: false,
  };

  if (existing) {
    // Update existing - only update fields that are provided
    const updateData: Record<string, unknown> = {};

    // Only include non-empty/non-zero values that differ
    if (input.title) updateData.title = input.title;
    if (input.projectPath) updateData.projectPath = input.projectPath;
    if (input.projectName) updateData.projectName = input.projectName;
    if (input.model) updateData.model = input.model;
    if (input.provider) updateData.provider = input.provider;
    if (input.source) updateData.source = input.source;
    if (input.promptTokens) updateData.promptTokens = input.promptTokens;
    if (input.completionTokens) updateData.completionTokens = input.completionTokens;
    if (input.cost) updateData.cost = input.cost;
    if (input.durationMs) updateData.durationMs = input.durationMs;

    // Recalculate totalTokens if tokens changed
    if (input.promptTokens || input.completionTokens) {
      updateData.totalTokens =
        (input.promptTokens || existing.promptTokens || 0) +
        (input.completionTokens || existing.completionTokens || 0);
    }

    if (Object.keys(updateData).length > 0) {
      await pb.collection("sessions").update(existing.id, updateData);
    }

    return { sessionId: existing.id, created: false };
  }

  // Create new session
  const session = await pb.collection("sessions").create<ExistingSession>(sessionData);
  return { sessionId: session.id, created: true };
}

// ============================================================================
// Message Upsert Logic
// ============================================================================

// Define a minimal session record type for upsertMessage
interface SessionRecord {
  id: string;
  messageCount: number;
}

// Define a minimal message record type
interface MessageRecord {
  id: string;
}

/**
 * Upsert a message - create if not exists, update if exists.
 * Also handles auto-creating session if it doesn't exist (out-of-order sync).
 *
 * WHY: Messages may arrive before their session (race condition in plugin)
 * so we need to handle auto-session-creation.
 */
async function upsertMessage(
  pb: PocketBase,
  userId: string,
  input: MessageInput
): Promise<{ messageId: string; created: boolean }> {
  if (!input.sessionExternalId) {
    throw new Error("Missing sessionExternalId");
  }
  if (!input.externalId) {
    throw new Error("Missing externalId");
  }

  // Find or create session
  let session: SessionRecord;
  try {
    session = await pb.collection("sessions").getFirstListItem<SessionRecord>(
      `user = "${userId}" && externalId = "${input.sessionExternalId}"`
    );
  } catch {
    // Session doesn't exist - create a placeholder
    session = await pb.collection("sessions").create<SessionRecord>({
      user: userId,
      externalId: input.sessionExternalId,
      title: "",
      source: input.source || "unknown",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cost: 0,
      messageCount: 0,
      isPublic: false,
      evalReady: false,
    });
  }

  // Try to find existing message by externalId
  let existing: MessageRecord | null = null;
  try {
    existing = await pb.collection("messages").getFirstListItem<MessageRecord>(
      `externalId = "${input.externalId}"`
    );
  } catch {
    // Not found - will create
  }

  const messageData = {
    session: session.id,
    externalId: input.externalId,
    role: input.role || "unknown",
    textContent: input.textContent || "",
    model: input.model || "",
    promptTokens: input.promptTokens || 0,
    completionTokens: input.completionTokens || 0,
    durationMs: input.durationMs || 0,
  };

  let messageId: string;

  if (existing) {
    // Update existing message
    await pb.collection("messages").update(existing.id, messageData);
    messageId = existing.id;
  } else {
    // Create new message
    const message = await pb.collection("messages").create<MessageRecord>(messageData);
    messageId = message.id;

    // Update session message count
    const currentCount = session.messageCount || 0;
    await pb.collection("sessions").update(session.id, {
      messageCount: currentCount + 1,
    });
  }

  // Handle parts if provided
  if (input.parts && input.parts.length > 0) {
    // Delete existing parts for this message first (full replace)
    try {
      const existingParts = await pb.collection("parts").getFullList({
        filter: `message = "${messageId}"`,
      });
      for (const part of existingParts) {
        await pb.collection("parts").delete(part.id);
      }
    } catch {
      // No existing parts
    }

    // Create new parts
    // WHY order starts at 1: PocketBase treats order=0 as "blank" for required number fields
    // This is a known behavior when min=0 and required=true
    for (let i = 0; i < input.parts.length; i++) {
      const part = input.parts[i];
      await pb.collection("parts").create({
        message: messageId,
        type: part.type || "text",
        content: part.content,
        order: i + 1, // 1-indexed to avoid PocketBase treating 0 as blank
      });
    }
  }

  // Update session searchable text (aggregate message content)
  try {
    const allMessages = await pb.collection("messages").getFullList({
      filter: `session = "${session.id}"`,
      sort: "created",
    });
    const searchableText = allMessages
      .map((m) => (m as Record<string, string>).textContent || "")
      .filter((t) => t.length > 0)
      .join("\n\n");

    // Also aggregate token counts
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    for (const m of allMessages) {
      totalPromptTokens += (m as Record<string, number>).promptTokens || 0;
      totalCompletionTokens += (m as Record<string, number>).completionTokens || 0;
    }

    await pb.collection("sessions").update(session.id, {
      searchableText: searchableText.slice(0, 100000), // Limit for DB
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
    });
  } catch (e) {
    console.error("Failed to update session searchable text:", e);
  }

  return { messageId, created: !existing };
}

// ============================================================================
// Endpoint Handlers
// ============================================================================

/**
 * POST /sync/session - Upsert a single session.
 */
export async function handleSyncSession(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (req.method === "OPTIONS") {
    return sendCorsPrelight(res);
  }

  const authHeader = req.headers.authorization;
  const auth = await validateApiKey(authHeader);

  if ("error" in auth) {
    return sendJson(res, { error: auth.error }, auth.status);
  }

  try {
    const body = await parseBody(req) as SessionInput;
    const result = await upsertSession(auth.pb, auth.user.id, body);
    sendJson(res, { ok: true, sessionId: result.sessionId, created: result.created });
  } catch (e) {
    console.error("Sync session error:", e);
    sendJson(res, { error: String(e) }, 500);
  }
}

/**
 * POST /sync/message - Upsert a single message with parts.
 */
export async function handleSyncMessage(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (req.method === "OPTIONS") {
    return sendCorsPrelight(res);
  }

  const authHeader = req.headers.authorization;
  const auth = await validateApiKey(authHeader);

  if ("error" in auth) {
    return sendJson(res, { error: auth.error }, auth.status);
  }

  try {
    const body = await parseBody(req) as MessageInput;
    const result = await upsertMessage(auth.pb, auth.user.id, body);
    sendJson(res, { ok: true, messageId: result.messageId, created: result.created });
  } catch (e) {
    console.error("Sync message error:", e);
    sendJson(res, { error: String(e) }, 500);
  }
}

/**
 * POST /sync/batch - Batch upsert sessions and messages.
 */
export async function handleSyncBatch(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (req.method === "OPTIONS") {
    return sendCorsPrelight(res);
  }

  const authHeader = req.headers.authorization;
  const auth = await validateApiKey(authHeader);

  if ("error" in auth) {
    return sendJson(res, { error: auth.error }, auth.status);
  }

  try {
    const body = await parseBody(req) as BatchInput;
    const errors: string[] = [];
    let sessionCount = 0;
    let messageCount = 0;

    // Process sessions first (messages may reference them)
    if (body.sessions && body.sessions.length > 0) {
      for (const session of body.sessions) {
        try {
          await upsertSession(auth.pb, auth.user.id, session);
          sessionCount++;
        } catch (e) {
          errors.push(`Session ${session.externalId || session.sessionId}: ${e}`);
        }
      }
    }

    // Process messages
    if (body.messages && body.messages.length > 0) {
      for (const message of body.messages) {
        try {
          await upsertMessage(auth.pb, auth.user.id, message);
          messageCount++;
        } catch (e) {
          errors.push(`Message ${message.externalId}: ${e}`);
        }
      }
    }

    sendJson(res, {
      ok: true,
      sessions: sessionCount,
      messages: messageCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    console.error("Sync batch error:", e);
    sendJson(res, { error: String(e) }, 500);
  }
}

/**
 * GET /sync/sessions/list - List all session external IDs for the user.
 */
export async function handleSyncSessionsList(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (req.method === "OPTIONS") {
    return sendCorsPrelight(res);
  }

  const authHeader = req.headers.authorization;
  const auth = await validateApiKey(authHeader);

  if ("error" in auth) {
    return sendJson(res, { error: auth.error }, auth.status);
  }

  try {
    const sessions = await auth.pb.collection("sessions").getFullList({
      filter: `user = "${auth.user.id}"`,
      fields: "externalId",
      sort: "-created",
    });

    const sessionIds = sessions.map((s) => (s as unknown as { externalId: string }).externalId);
    sendJson(res, { sessionIds });
  } catch (e) {
    console.error("List sessions error:", e);
    sendJson(res, { error: String(e) }, 500);
  }
}
