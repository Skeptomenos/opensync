/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration: Create parts collection
 * 
 * Parts represent individual components of a message (text, tool calls, code blocks, etc.).
 * Each part belongs to a message and contains structured content with ordering.
 * 
 * Schema based on: convex/schema.ts parts table
 * Spec: ralph-wiggum/specs/POCKETBASE_MIGRATION.md
 * 
 * Fields:
 * - message: relation to messages (required, cascade delete)
 * - type: string identifying the part type (e.g., "text", "tool_call", "code_block")
 * - content: JSON blob containing the actual part content
 * - order: number for ordering parts within a message
 * 
 * Indexes:
 * - by_message: filter parts by message
 * - by_message_order: order parts within a message
 */
migrate((app) => {
  // Create a new base collection for parts
  let collection = new Collection({
    type: "base",
    name: "parts",
    // Access rules: parts inherit access from their parent message's session
    // Users can access parts if they own the parent session or if it's public
    listRule: "@request.auth.id != '' && message.session.user = @request.auth.id",
    viewRule: "@request.auth.id != '' && (message.session.user = @request.auth.id || message.session.isPublic = true)",
    createRule: "@request.auth.id != '' && message.session.user = @request.auth.id",
    updateRule: "@request.auth.id != '' && message.session.user = @request.auth.id",
    deleteRule: "@request.auth.id != '' && message.session.user = @request.auth.id",
    fields: [
      // Relation to messages collection (required)
      // Cascade delete: when message is deleted, all its parts are deleted
      {
        name: "message",
        type: "relation",
        required: true,
        maxSelect: 1,
        collectionId: "pbc_2605467279", // messages collection ID
        cascadeDelete: true,
      },
      // Part type identifier (e.g., "text", "tool_call", "tool_result", "code_block")
      // Common types from OpenCode/Claude Code:
      // - "text": Plain text content
      // - "tool_call": Tool invocation with name and arguments
      // - "tool_result": Result from a tool call
      // - "code_block": Code snippet with language
      {
        name: "type",
        type: "text",
        required: true,
        max: 100,
      },
      // Flexible JSON content blob
      // Structure varies by type, examples:
      // - text: { "text": "..." }
      // - tool_call: { "name": "...", "args": {...} }
      // - code_block: { "language": "...", "code": "..." }
      {
        name: "content",
        type: "json",
        required: false,
        maxSize: 1048576, // 1MB max for large code blocks or tool results
      },
      // Order of this part within the message
      // Parts are displayed in ascending order
      {
        name: "order",
        type: "number",
        required: true,
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
      // Index: by_message - filter parts by message
      "CREATE INDEX idx_parts_message ON parts (message)",
      // Index: by_message_order - order parts within a message
      "CREATE INDEX idx_parts_message_order ON parts (message, \"order\")",
    ],
  });

  app.save(collection);
}, (app) => {
  let collection = app.findCollectionByNameOrId("parts");
  app.delete(collection);
});
