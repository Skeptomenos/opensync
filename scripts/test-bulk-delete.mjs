#!/usr/bin/env node
/**
 * Test script for bulk delete operations.
 *
 * Creates 10 test sessions with messages and parts, then deletes them all
 * using the same cascade logic as useBulkOperations.
 *
 * Usage:
 *   node scripts/test-bulk-delete.mjs
 *
 * Prerequisites:
 *   - Pocketbase running at localhost:8090
 *   - At least one admin user created
 */

import PocketBase from "pocketbase";

const PB_URL = process.env.POCKETBASE_URL || "http://localhost:8090";
const TEST_SESSION_COUNT = 10;

const Collections = {
  SESSIONS: "sessions",
  MESSAGES: "messages",
  PARTS: "parts",
};

async function main() {
  console.log(`\n=== Bulk Delete Test ===`);
  console.log(`Pocketbase URL: ${PB_URL}`);
  console.log(`Test session count: ${TEST_SESSION_COUNT}\n`);

  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);

  // Get admin credentials from environment or use defaults
  const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || "admin@example.com";
  const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || "adminpassword123";

  // Check health
  try {
    const health = await pb.health.check();
    console.log(`Pocketbase health: ${health.code === 200 ? "OK" : "FAIL"}`);
  } catch (err) {
    console.error(`ERROR: Cannot connect to Pocketbase at ${PB_URL}`);
    console.error(`Make sure Pocketbase is running: ./bin/pocketbase serve`);
    process.exit(1);
  }

  // Try to authenticate as admin
  try {
    await pb.admins.authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
    console.log(`Authenticated as admin: ${ADMIN_EMAIL}`);
  } catch {
    console.log(`Note: Admin auth failed, will try to create user without admin auth.`);
    console.log(`Set PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD env vars if needed.`);
  }

  // Get first user to use as owner, or create a test user
  let userId;
  try {
    const users = await pb.collection("users").getList(1, 1);
    if (users.items.length === 0) {
      console.log("No users found, creating test user...");
      const testUser = await pb.collection("users").create({
        email: "test@example.com",
        password: "testpassword123",
        passwordConfirm: "testpassword123",
        name: "Test User",
        autheliaId: "test@example.com",
      });
      userId = testUser.id;
      console.log(`Created test user: ${userId}`);
    } else {
      userId = users.items[0].id;
    }
    console.log(`Using user: ${userId}\n`);
  } catch (err) {
    console.error("ERROR: Failed to get/create user:", err.message);
    process.exit(1);
  }

  // Create test sessions
  console.log(`Creating ${TEST_SESSION_COUNT} test sessions...`);
  const createdSessionIds = [];

  for (let i = 0; i < TEST_SESSION_COUNT; i++) {
    const sessionData = {
      user: userId,
      externalId: `test-bulk-delete-${Date.now()}-${i}`,
      title: `Test Session ${i + 1}`,
      projectPath: "/test/bulk-delete",
      projectName: "bulk-delete-test",
      model: "test-model",
      provider: "test",
      source: "opencode",
      promptTokens: 100,
      completionTokens: 200,
      totalTokens: 300,
      cost: 0.001,
      durationMs: 1000,
      messageCount: 2,
      searchableText: "test bulk delete session",
    };

    try {
      const session = await pb.collection(Collections.SESSIONS).create(sessionData);
      createdSessionIds.push(session.id);

      // Create 2 messages per session
      for (let j = 0; j < 2; j++) {
        const messageData = {
          session: session.id,
          externalId: `${session.externalId}-msg-${j}`,
          role: j === 0 ? "user" : "assistant",
          textContent: `Test message ${j + 1} for session ${i + 1}`,
          model: "test-model",
          promptTokens: j === 0 ? 100 : 0,
          completionTokens: j === 1 ? 200 : 0,
          durationMs: 500,
        };

        const message = await pb.collection(Collections.MESSAGES).create(messageData);

        // Create 1 part per message
        const partData = {
          message: message.id,
          type: "text",
          content: { text: messageData.textContent },
          order: 0,
        };
        await pb.collection(Collections.PARTS).create(partData);
      }

      process.stdout.write(".");
    } catch (err) {
      console.error(`\nERROR creating session ${i + 1}:`, err.message);
      if (err.response?.data) {
        console.error("Details:", JSON.stringify(err.response.data, null, 2));
      }
      if (err.data) {
        console.error("Data:", JSON.stringify(err.data, null, 2));
      }
      process.exit(1);
    }
  }

  console.log(` Done!`);
  console.log(`Created ${createdSessionIds.length} sessions with messages and parts.\n`);

  // Now delete them all using the cascade logic
  console.log(`Deleting ${createdSessionIds.length} sessions with cascade...`);
  const deleteStart = Date.now();
  let deletedCount = 0;
  const failedIds = [];

  for (const sessionId of createdSessionIds) {
    try {
      // 1. Get all messages for this session
      const messagesResult = await pb
        .collection(Collections.MESSAGES)
        .getList(1, 500, { filter: `session = "${sessionId}"` });
      const messageIds = messagesResult.items.map((m) => m.id);

      // 2. Delete all parts for these messages
      if (messageIds.length > 0) {
        const partsFilter = messageIds.map((id) => `message = "${id}"`).join(" || ");
        const partsResult = await pb
          .collection(Collections.PARTS)
          .getList(1, 5000, { filter: partsFilter });

        for (const part of partsResult.items) {
          await pb.collection(Collections.PARTS).delete(part.id);
        }
      }

      // 3. Delete all messages
      for (const msg of messagesResult.items) {
        await pb.collection(Collections.MESSAGES).delete(msg.id);
      }

      // 4. Delete the session
      await pb.collection(Collections.SESSIONS).delete(sessionId);

      deletedCount++;
      process.stdout.write(".");
    } catch (err) {
      console.error(`\nERROR deleting session ${sessionId}:`, err.message);
      failedIds.push(sessionId);
    }
  }

  const deleteEnd = Date.now();
  const durationMs = deleteEnd - deleteStart;

  console.log(` Done!`);
  console.log(`\n=== Results ===`);
  console.log(`Sessions deleted: ${deletedCount}/${createdSessionIds.length}`);
  console.log(`Failed: ${failedIds.length}`);
  console.log(`Duration: ${durationMs}ms (${(durationMs / deletedCount).toFixed(1)}ms per session)`);

  // Verify no sessions remain
  console.log(`\nVerifying cleanup...`);
  for (const sessionId of createdSessionIds) {
    try {
      await pb.collection(Collections.SESSIONS).getOne(sessionId);
      console.error(`ERROR: Session ${sessionId} still exists!`);
      process.exit(1);
    } catch {
      // Expected - session should not exist
    }
  }
  console.log(`All test sessions successfully deleted.`);

  // Final verdict
  console.log(`\n=== PASS: Bulk delete of ${TEST_SESSION_COUNT} sessions works! ===\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
