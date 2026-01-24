/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration: Fix sessions externalId index
 *
 * PROBLEM: The original migration created idx_sessions_external_id as globally
 * unique, but externalId should only be unique per user (same session ID from
 * different users should be allowed).
 *
 * FIX: Drop the global unique index and keep only the user+externalId composite
 * unique index.
 */
migrate((app) => {
  const collection = app.findCollectionByNameOrId("sessions");

  // Remove the global unique index on externalId
  // Keep the user+externalId composite index which is the correct uniqueness constraint
  collection.indexes = collection.indexes.filter(
    (idx) => !idx.includes("idx_sessions_external_id ON sessions (externalId)")
  );

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("sessions");

  // Restore the global unique index (though this shouldn't be needed in practice)
  collection.indexes.push(
    "CREATE UNIQUE INDEX idx_sessions_external_id ON sessions (externalId)"
  );

  return app.save(collection);
});
