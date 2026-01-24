/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration: Add created/updated autodate fields to sessions collection
 * 
 * Pocketbase base collections should have created/updated fields for timestamps.
 * These are used for sorting, filtering, and tracking record changes.
 */
migrate((app) => {
  const collection = app.findCollectionByNameOrId("sessions");

  // Add created autodate field
  collection.fields.add(new Field({
    hidden: false,
    id: "autodate2990389176",
    name: "created",
    onCreate: true,
    onUpdate: false,
    presentable: false,
    system: false,
    type: "autodate"
  }));

  // Add updated autodate field
  collection.fields.add(new Field({
    hidden: false,
    id: "autodate3332085495",
    name: "updated",
    onCreate: true,
    onUpdate: true,
    presentable: false,
    system: false,
    type: "autodate"
  }));

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("sessions");

  // Remove the autodate fields
  collection.fields.removeById("autodate2990389176");
  collection.fields.removeById("autodate3332085495");

  return app.save(collection);
});
