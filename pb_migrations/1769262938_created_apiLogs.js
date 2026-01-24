/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration: Create apiLogs collection
 * 
 * API logs track all external API calls made by users for monitoring,
 * debugging, and usage analytics. Each log entry records the endpoint,
 * method, response status, and timing information.
 * 
 * Schema based on: convex/schema.ts apiLogs table
 * Spec: ralph-wiggum/specs/POCKETBASE_MIGRATION.md (lines 171-183)
 * 
 * Fields:
 * - user: relation to users (required, cascade delete)
 * - endpoint: the API endpoint path that was called
 * - method: HTTP method (GET, POST, PUT, DELETE, etc.)
 * - statusCode: HTTP response status code
 * - responseTimeMs: time taken to process the request in milliseconds
 * 
 * Indexes:
 * - by_user: filter logs by user
 * - by_user_created: filter logs by user and order by creation time
 */
migrate((app) => {
  // Create a new base collection for API logs
  let collection = new Collection({
    type: "base",
    name: "apiLogs",
    // Access rules: users can only access their own API logs
    // Admin-only for create (API endpoints create these, not users)
    listRule: "@request.auth.id != '' && user = @request.auth.id",
    viewRule: "@request.auth.id != '' && user = @request.auth.id",
    createRule: null, // Only server-side/admin can create logs
    updateRule: null, // Logs are immutable
    deleteRule: "@request.auth.id != '' && user = @request.auth.id",
    fields: [
      // Relation to users collection (required)
      // Cascade delete: when user is deleted, all their logs are deleted
      {
        name: "user",
        type: "relation",
        required: true,
        maxSelect: 1,
        collectionId: "_pb_users_auth_",
        cascadeDelete: true,
      },
      // API endpoint path that was called (e.g., "/api/sync/session", "/api/sessions")
      {
        name: "endpoint",
        type: "text",
        required: true,
        max: 500,
      },
      // HTTP method used for the request
      {
        name: "method",
        type: "select",
        required: true,
        values: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
        maxSelect: 1,
      },
      // HTTP response status code (e.g., 200, 401, 500)
      {
        name: "statusCode",
        type: "number",
        required: true,
        min: 100,
        max: 599,
        noDecimal: true,
      },
      // Time taken to process the request in milliseconds
      {
        name: "responseTimeMs",
        type: "number",
        required: true,
        min: 0,
        noDecimal: true,
      },
      // Auto-managed created timestamp
      // Note: This serves as the "createdAt" field from the spec
      {
        name: "created",
        type: "autodate",
        onCreate: true,
        onUpdate: false,
      },
      // Auto-managed updated timestamp (for consistency with other collections)
      {
        name: "updated",
        type: "autodate",
        onCreate: true,
        onUpdate: true,
      },
    ],
    indexes: [
      // Index: by_user - filter logs by user
      "CREATE INDEX idx_apiLogs_user ON apiLogs (user)",
      // Index: by_user_created - filter logs by user and order by creation time (most recent first)
      "CREATE INDEX idx_apiLogs_user_created ON apiLogs (user, created DESC)",
    ],
  });

  app.save(collection);
}, (app) => {
  let collection = app.findCollectionByNameOrId("apiLogs");
  app.delete(collection);
});
