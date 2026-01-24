#!/usr/bin/env node
/**
 * Test script for sync API endpoints.
 *
 * Usage:
 *   node scripts/test-sync-endpoints.mjs
 *
 * Prerequisites:
 *   1. Pocketbase must be running on :8090
 *   2. Vite dev server must be running on :5173
 *   3. A test user must exist with an API key
 *
 * To create a test user with API key:
 *   1. Open Pocketbase admin: http://localhost:8090/_/
 *   2. Go to users collection
 *   3. Create user with email and set apiKey field
 */

import PocketBase from "pocketbase";

const POCKETBASE_URL = "http://localhost:8090";
const VITE_URL = "http://localhost:5173";

// Generate a random test API key
const TEST_API_KEY = `os_test_${Date.now().toString(36)}`;
const TEST_EMAIL = `test_${Date.now()}@example.com`;

async function setup() {
  console.log("Setting up test user...");
  const pb = new PocketBase(POCKETBASE_URL);

  try {
    // Create test user with API key
    const user = await pb.collection("users").create({
      email: TEST_EMAIL,
      password: "testpassword123",
      passwordConfirm: "testpassword123",
      name: "Test User",
      apiKey: TEST_API_KEY,
      autheliaId: TEST_EMAIL,
    });

    console.log(`Created test user: ${user.id}`);
    console.log(`API Key: ${TEST_API_KEY}`);
    return { pb, userId: user.id };
  } catch (e) {
    console.error("Setup failed:", e.message);
    throw e;
  }
}

async function cleanup(pb, userId) {
  console.log("\nCleaning up...");
  try {
    // Delete test sessions and their related data
    const sessions = await pb.collection("sessions").getFullList({
      filter: `user = "${userId}"`,
    });

    for (const session of sessions) {
      // Delete parts for messages in this session
      const messages = await pb.collection("messages").getFullList({
        filter: `session = "${session.id}"`,
      });

      for (const message of messages) {
        const parts = await pb.collection("parts").getFullList({
          filter: `message = "${message.id}"`,
        });
        for (const part of parts) {
          await pb.collection("parts").delete(part.id);
        }
        await pb.collection("messages").delete(message.id);
      }

      await pb.collection("sessions").delete(session.id);
    }

    // Delete test user
    await pb.collection("users").delete(userId);
    console.log("Cleanup complete");
  } catch (e) {
    console.error("Cleanup error:", e.message);
  }
}

async function testSyncSession() {
  console.log("\n=== Test: POST /sync/session ===");

  const response = await fetch(`${VITE_URL}/sync/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TEST_API_KEY}`,
    },
    body: JSON.stringify({
      externalId: "test-session-001",
      title: "Test Session",
      projectPath: "/home/user/project",
      projectName: "my-project",
      model: "claude-3-5-sonnet",
      source: "opencode",
      promptTokens: 100,
      completionTokens: 200,
      cost: 0.005,
    }),
  });

  const data = await response.json();
  console.log("Status:", response.status);
  console.log("Response:", JSON.stringify(data, null, 2));

  if (!data.ok) {
    throw new Error(`Session sync failed: ${data.error}`);
  }

  console.log("PASS: Session created");
  return data.sessionId;
}

async function testSyncMessage(sessionExternalId) {
  console.log("\n=== Test: POST /sync/message ===");

  const response = await fetch(`${VITE_URL}/sync/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TEST_API_KEY}`,
    },
    body: JSON.stringify({
      sessionExternalId,
      externalId: "test-message-001",
      role: "user",
      textContent: "Hello, can you help me with this code?",
      parts: [
        { type: "text", content: { text: "Hello, can you help me with this code?" } },
      ],
    }),
  });

  const data = await response.json();
  console.log("Status:", response.status);
  console.log("Response:", JSON.stringify(data, null, 2));

  if (!data.ok) {
    throw new Error(`Message sync failed: ${data.error}`);
  }

  console.log("PASS: Message created");

  // Test assistant response message
  const response2 = await fetch(`${VITE_URL}/sync/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TEST_API_KEY}`,
    },
    body: JSON.stringify({
      sessionExternalId,
      externalId: "test-message-002",
      role: "assistant",
      textContent: "Of course! Let me help you with that code.",
      model: "claude-3-5-sonnet",
      promptTokens: 50,
      completionTokens: 100,
      parts: [
        { type: "text", content: { text: "Of course! Let me help you with that code." } },
        {
          type: "tool_call",
          content: {
            toolName: "read",
            toolCallId: "tc_001",
            args: { filePath: "src/main.ts" },
          },
        },
      ],
    }),
  });

  const data2 = await response2.json();
  console.log("Assistant message response:", JSON.stringify(data2, null, 2));

  if (!data2.ok) {
    throw new Error(`Assistant message sync failed: ${data2.error}`);
  }

  console.log("PASS: Assistant message with tool call created");
}

async function testSyncBatch() {
  console.log("\n=== Test: POST /sync/batch ===");

  const response = await fetch(`${VITE_URL}/sync/batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TEST_API_KEY}`,
    },
    body: JSON.stringify({
      sessions: [
        {
          externalId: "batch-session-001",
          title: "Batch Session 1",
          source: "claude-code",
          model: "claude-3-opus",
        },
        {
          externalId: "batch-session-002",
          title: "Batch Session 2",
          source: "opencode",
          model: "gpt-4o",
        },
      ],
      messages: [
        {
          sessionExternalId: "batch-session-001",
          externalId: "batch-msg-001",
          role: "user",
          textContent: "First batch message",
        },
        {
          sessionExternalId: "batch-session-002",
          externalId: "batch-msg-002",
          role: "user",
          textContent: "Second batch message",
        },
      ],
    }),
  });

  const data = await response.json();
  console.log("Status:", response.status);
  console.log("Response:", JSON.stringify(data, null, 2));

  if (!data.ok) {
    throw new Error(`Batch sync failed: ${data.error}`);
  }

  if (data.sessions !== 2) {
    throw new Error(`Expected 2 sessions, got ${data.sessions}`);
  }

  if (data.messages !== 2) {
    throw new Error(`Expected 2 messages, got ${data.messages}`);
  }

  console.log("PASS: Batch sync completed");
}

async function testListSessions() {
  console.log("\n=== Test: GET /sync/sessions/list ===");

  const response = await fetch(`${VITE_URL}/sync/sessions/list`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${TEST_API_KEY}`,
    },
  });

  const data = await response.json();
  console.log("Status:", response.status);
  console.log("Response:", JSON.stringify(data, null, 2));

  if (!data.sessionIds) {
    throw new Error(`List sessions failed: ${data.error}`);
  }

  const expectedIds = ["test-session-001", "batch-session-001", "batch-session-002"];
  for (const id of expectedIds) {
    if (!data.sessionIds.includes(id)) {
      throw new Error(`Missing expected session: ${id}`);
    }
  }

  console.log(`PASS: Found ${data.sessionIds.length} sessions`);
}

async function testInvalidApiKey() {
  console.log("\n=== Test: Invalid API Key ===");

  const response = await fetch(`${VITE_URL}/sync/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer osk_invalid_key",
    },
    body: JSON.stringify({
      externalId: "should-fail",
    }),
  });

  const data = await response.json();
  console.log("Status:", response.status);

  if (response.status !== 401) {
    throw new Error(`Expected 401, got ${response.status}`);
  }

  console.log("PASS: Invalid API key rejected");
}

async function testMissingAuth() {
  console.log("\n=== Test: Missing Authorization ===");

  const response = await fetch(`${VITE_URL}/sync/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      externalId: "should-fail",
    }),
  });

  const data = await response.json();
  console.log("Status:", response.status);

  if (response.status !== 401) {
    throw new Error(`Expected 401, got ${response.status}`);
  }

  console.log("PASS: Missing auth rejected");
}

async function main() {
  console.log("===========================================");
  console.log("  Sync API Endpoint Tests");
  console.log("===========================================");

  let pb, userId;

  try {
    // Setup
    const setupResult = await setup();
    pb = setupResult.pb;
    userId = setupResult.userId;

    // Wait a moment for the user to be available
    await new Promise((r) => setTimeout(r, 500));

    // Run tests
    await testSyncSession();
    await testSyncMessage("test-session-001");
    await testSyncBatch();
    await testListSessions();
    await testInvalidApiKey();
    await testMissingAuth();

    console.log("\n===========================================");
    console.log("  ALL TESTS PASSED");
    console.log("===========================================");
  } catch (e) {
    console.error("\n===========================================");
    console.error("  TEST FAILED:", e.message);
    console.error("===========================================");
    process.exitCode = 1;
  } finally {
    // Cleanup
    if (pb && userId) {
      await cleanup(pb, userId);
    }
  }
}

main();
