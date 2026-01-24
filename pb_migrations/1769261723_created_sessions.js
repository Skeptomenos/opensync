/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration: Create sessions collection
 * 
 * Sessions represent coding sessions from OpenCode and Claude Code plugins.
 * Each session belongs to a user and contains messages with token usage,
 * cost tracking, and metadata for search and evaluation.
 * 
 * Schema based on: convex/schema.ts sessions table
 * Spec: ralph-wiggum/specs/POCKETBASE_MIGRATION.md
 */
migrate((app) => {
  // Create a new base collection for sessions
  let collection = new Collection({
    type: "base",
    name: "sessions",
    // Access rules: authenticated users can only access their own sessions
    // Note: Public sessions with isPublic=true are handled separately
    listRule: "@request.auth.id != '' && user = @request.auth.id",
    viewRule: "@request.auth.id != '' && (user = @request.auth.id || isPublic = true)",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != '' && user = @request.auth.id",
    deleteRule: "@request.auth.id != '' && user = @request.auth.id",
    fields: [
      // Relation to users collection (required)
      {
        name: "user",
        type: "relation",
        required: true,
        maxSelect: 1,
        collectionId: "_pb_users_auth_",
        cascadeDelete: true,
      },
      // External ID from source system (unique per user)
      {
        name: "externalId",
        type: "text",
        required: true,
        max: 255,
      },
      // Session title (usually auto-generated from first message)
      {
        name: "title",
        type: "text",
        required: false,
        max: 500,
      },
      // Full path to the project directory
      {
        name: "projectPath",
        type: "text",
        required: false,
        max: 1000,
      },
      // Short project name (usually last segment of path)
      {
        name: "projectName",
        type: "text",
        required: false,
        max: 255,
      },
      // LLM model used (e.g., "gpt-4", "claude-3-opus")
      {
        name: "model",
        type: "text",
        required: false,
        max: 100,
      },
      // LLM provider (e.g., "openai", "anthropic")
      {
        name: "provider",
        type: "text",
        required: false,
        max: 50,
      },
      // Source identifier: "opencode" or "claude-code"
      {
        name: "source",
        type: "text",
        required: false,
        max: 50,
      },
      // Token usage - promptTokens
      {
        name: "promptTokens",
        type: "number",
        required: false,
        min: 0,
        noDecimal: true,
      },
      // Token usage - completionTokens
      {
        name: "completionTokens",
        type: "number",
        required: false,
        min: 0,
        noDecimal: true,
      },
      // Token usage - totalTokens
      {
        name: "totalTokens",
        type: "number",
        required: false,
        min: 0,
        noDecimal: true,
      },
      // Cost in USD (stored as float, e.g., 0.0025)
      {
        name: "cost",
        type: "number",
        required: false,
        min: 0,
      },
      // Duration of session in milliseconds
      {
        name: "durationMs",
        type: "number",
        required: false,
        min: 0,
        noDecimal: true,
      },
      // Public visibility flag
      {
        name: "isPublic",
        type: "bool",
        required: false,
      },
      // Public slug for sharing (unique when set)
      {
        name: "publicSlug",
        type: "text",
        required: false,
        max: 100,
      },
      // Full-text searchable content (combined from title + messages)
      {
        name: "searchableText",
        type: "text",
        required: false,
      },
      // AI-generated or user-provided summary
      {
        name: "summary",
        type: "text",
        required: false,
        max: 5000,
      },
      // Count of messages in this session
      {
        name: "messageCount",
        type: "number",
        required: false,
        min: 0,
        noDecimal: true,
      },
      // Eval: ready for review/export
      {
        name: "evalReady",
        type: "bool",
        required: false,
      },
      // Eval: timestamp when reviewed
      {
        name: "reviewedAt",
        type: "date",
        required: false,
      },
      // Eval: reviewer notes
      {
        name: "evalNotes",
        type: "text",
        required: false,
        max: 5000,
      },
      // Eval: tags for categorization (stored as JSON array)
      {
        name: "evalTags",
        type: "json",
        required: false,
        maxSize: 10000,
      },
    ],
    indexes: [
      // Index: by_user - filter sessions by user
      "CREATE INDEX idx_sessions_user ON sessions (user)",
      // Index: by_external_id - lookup by external system ID
      "CREATE UNIQUE INDEX idx_sessions_external_id ON sessions (externalId)",
      // Index: by_user_external - composite for upsert operations
      "CREATE UNIQUE INDEX idx_sessions_user_external ON sessions (user, externalId)",
      // Index: by_user_source - filter by source per user
      "CREATE INDEX idx_sessions_user_source ON sessions (user, source)",
      // Index: by_user_eval_ready - filter eval-ready sessions per user
      "CREATE INDEX idx_sessions_user_eval_ready ON sessions (user, evalReady)",
    ],
  });

  app.save(collection);
}, (app) => {
  let collection = app.findCollectionByNameOrId("sessions");
  app.delete(collection);
});
