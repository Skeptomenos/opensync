/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration: Add user+updated index to sessions collection
 * 
 * This index supports sorting sessions by last update per user,
 * which is the primary sort order for the dashboard.
 */
migrate((app) => {
  const collection = app.findCollectionByNameOrId("sessions");

  // Add index for sorting by updated per user
  collection.indexes.push("CREATE INDEX idx_sessions_user_updated ON sessions (user, updated DESC)");

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("sessions");

  // Remove the index
  const indexToRemove = "CREATE INDEX idx_sessions_user_updated ON sessions (user, updated DESC)";
  const idx = collection.indexes.indexOf(indexToRemove);
  if (idx > -1) {
    collection.indexes.splice(idx, 1);
  }

  return app.save(collection);
});
