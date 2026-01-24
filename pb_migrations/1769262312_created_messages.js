/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration: Create messages collection
 * 
 * Messages represent individual messages within coding sessions.
 * Each message belongs to a session and contains the conversation content,
 * token usage, and role information.
 * 
 * Schema based on: convex/schema.ts messages table
 * Spec: ralph-wiggum/specs/POCKETBASE_MIGRATION.md
 * 
 * Indexes:
 * - by_session: filter messages by session
 * - by_session_created: order messages within a session
 * - by_external_id: lookup by external system ID (unique)
 * 
 * Full-text search: textContent field for searching message content
 */
migrate((app) => {
  // Create a new base collection for messages
  let collection = new Collection({
    type: "base",
    name: "messages",
    // Access rules: messages inherit access from their parent session
    // Users can access messages if they own the parent session or if it's public
    listRule: "@request.auth.id != '' && session.user = @request.auth.id",
    viewRule: "@request.auth.id != '' && (session.user = @request.auth.id || session.isPublic = true)",
    createRule: "@request.auth.id != '' && session.user = @request.auth.id",
    updateRule: "@request.auth.id != '' && session.user = @request.auth.id",
    deleteRule: "@request.auth.id != '' && session.user = @request.auth.id",
    fields: [
      // Relation to sessions collection (required)
      // Cascade delete: when session is deleted, all its messages are deleted
      {
        name: "session",
        type: "relation",
        required: true,
        maxSelect: 1,
        collectionId: "pbc_3660498186", // sessions collection ID
        cascadeDelete: true,
      },
      // External ID from source system (unique per message)
      // Used for upsert operations during sync
      {
        name: "externalId",
        type: "text",
        required: true,
        max: 255,
      },
      // Message role: user, assistant, system, or unknown
      // Determines how the message is displayed in the UI
      {
        name: "role",
        type: "select",
        required: true,
        values: ["user", "assistant", "system", "unknown"],
        maxSelect: 1,
      },
      // Full text content of the message
      // Used for display and full-text search
      {
        name: "textContent",
        type: "text",
        required: false,
      },
      // LLM model used for this specific message (may differ from session model)
      {
        name: "model",
        type: "text",
        required: false,
        max: 100,
      },
      // Token usage - promptTokens for this message
      {
        name: "promptTokens",
        type: "number",
        required: false,
        min: 0,
        noDecimal: true,
      },
      // Token usage - completionTokens for this message
      {
        name: "completionTokens",
        type: "number",
        required: false,
        min: 0,
        noDecimal: true,
      },
      // Duration of this message's generation in milliseconds
      {
        name: "durationMs",
        type: "number",
        required: false,
        min: 0,
        noDecimal: true,
      },
      // Auto-managed created timestamp
      {
        name: "created",
        type: "autodate",
        onCreate: true,
        onUpdate: false,
      },
      // Auto-managed updated timestamp
      {
        name: "updated",
        type: "autodate",
        onCreate: true,
        onUpdate: true,
      },
    ],
    indexes: [
      // Index: by_session - filter messages by session
      "CREATE INDEX idx_messages_session ON messages (session)",
      // Index: by_session_created - order messages within a session by creation time
      "CREATE INDEX idx_messages_session_created ON messages (session, created)",
      // Index: by_external_id - lookup by external system ID (unique)
      "CREATE UNIQUE INDEX idx_messages_external_id ON messages (externalId)",
    ],
  });

  app.save(collection);
}, (app) => {
  let collection = app.findCollectionByNameOrId("messages");
  app.delete(collection);
});
