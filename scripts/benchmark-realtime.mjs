/**
 * Pocketbase Realtime Subscription Benchmark
 *
 * Measures the latency between:
 * 1. Creating/updating a record
 * 2. Receiving the change via WebSocket subscription
 *
 * Acceptance criteria: Sub-500ms latency for session updates
 *
 * Usage: node scripts/benchmark-realtime.mjs
 */

// Node.js polyfill for EventSource (required for Pocketbase realtime)
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { EventSource } = require("eventsource");
global.EventSource = EventSource;

import PocketBase from "pocketbase";

const POCKETBASE_URL = "http://localhost:8090";
const NUM_TRIALS = 10;
const TIMEOUT_MS = 5000;

// Test user credentials (created if doesn't exist)
const TEST_EMAIL = "benchmark-test@opensync.local";
const TEST_PASSWORD = "benchmark-test-password-123!";

async function main() {
  console.log("=".repeat(60));
  console.log("Pocketbase Realtime Subscription Benchmark");
  console.log("=".repeat(60));
  console.log(`Target: < 500ms latency`);
  console.log(`Trials: ${NUM_TRIALS}`);
  console.log(`Pocketbase: ${POCKETBASE_URL}`);
  console.log("");

  const pb = new PocketBase(POCKETBASE_URL);
  pb.autoCancellation(false);

  // Step 1: Health check
  console.log("[1/6] Checking Pocketbase health...");
  try {
    const health = await pb.send("/api/health", { method: "GET" });
    console.log(`      Status: ${health.message}`);
  } catch (err) {
    console.error("      FAILED: Pocketbase not reachable");
    console.error(`      Error: ${err.message}`);
    process.exit(1);
  }

  // Step 2: Create or login test user
  console.log("\n[2/6] Setting up test user...");
  let testUser;
  try {
    // Try to login first
    const authData = await pb.collection("users").authWithPassword(TEST_EMAIL, TEST_PASSWORD);
    testUser = authData.record;
    console.log(`      Logged in as: ${testUser.email}`);
  } catch (loginErr) {
    // User doesn't exist, create it
    try {
      testUser = await pb.collection("users").create({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        passwordConfirm: TEST_PASSWORD,
        name: "Benchmark Test User",
        autheliaId: TEST_EMAIL,
      });
      // Login after creation
      const authData = await pb.collection("users").authWithPassword(TEST_EMAIL, TEST_PASSWORD);
      testUser = authData.record;
      console.log(`      Created and logged in as: ${testUser.email}`);
    } catch (createErr) {
      console.error(`      FAILED: Could not create test user`);
      console.error(`      Error: ${createErr.message}`);
      process.exit(1);
    }
  }

  // Step 3: Subscribe to sessions collection
  console.log("\n[3/6] Subscribing to sessions collection...");

  // Event queue to capture subscription events
  const eventQueue = [];
  let eventResolver = null;

  try {
    await pb.collection("sessions").subscribe("*", (e) => {
      const receivedAt = performance.now();
      eventQueue.push({ ...e, receivedAt });
      if (eventResolver) {
        eventResolver();
        eventResolver = null;
      }
    });
    console.log("      Subscription established");
  } catch (err) {
    console.error("      FAILED: Could not subscribe");
    console.error(`      Error: ${err.message}`);
    process.exit(1);
  }

  // Give subscription a moment to fully establish
  await new Promise((r) => setTimeout(r, 500));

  // Helper to wait for an event with the given record ID
  async function waitForEventWithId(recordId, timeoutMs = TIMEOUT_MS) {
    const deadline = performance.now() + timeoutMs;

    while (performance.now() < deadline) {
      // Check queue for matching event
      const idx = eventQueue.findIndex((e) => e.record?.id === recordId);
      if (idx !== -1) {
        return eventQueue.splice(idx, 1)[0];
      }

      // Wait for next event or timeout
      const remaining = deadline - performance.now();
      if (remaining <= 0) break;

      await Promise.race([
        new Promise((r) => {
          eventResolver = r;
        }),
        new Promise((r) => setTimeout(r, Math.min(remaining, 100))),
      ]);
    }

    throw new Error(`Timeout waiting for subscription event (${timeoutMs}ms)`);
  }

  // Step 4: Benchmark CREATE operations
  console.log("\n[4/6] Benchmarking CREATE operations...");
  const createLatencies = [];
  const createdSessions = [];

  for (let i = 0; i < NUM_TRIALS; i++) {
    const externalId = `benchmark-${Date.now()}-${i}`;
    const startTime = performance.now();

    try {
      // Create session
      const session = await pb.collection("sessions").create({
        user: testUser.id,
        externalId,
        title: `Benchmark Session ${i + 1}`,
        source: "benchmark",
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        cost: 0.001,
        messageCount: 0,
        isPublic: false,
      });

      // Wait for subscription event matching this session
      const event = await waitForEventWithId(session.id);
      const latency = event.receivedAt - startTime;
      createLatencies.push(latency);
      createdSessions.push(session);
      process.stdout.write(
        `      Trial ${i + 1}/${NUM_TRIALS}: ${latency.toFixed(1)}ms (${event.action})\n`
      );
    } catch (err) {
      console.error(`      Trial ${i + 1}/${NUM_TRIALS}: FAILED - ${err.message}`);
    }
  }

  // Step 5: Benchmark UPDATE operations
  console.log("\n[5/6] Benchmarking UPDATE operations...");
  const updateLatencies = [];

  for (let i = 0; i < createdSessions.length; i++) {
    const session = createdSessions[i];
    const startTime = performance.now();

    try {
      // Update session
      await pb.collection("sessions").update(session.id, {
        title: `Updated Benchmark Session ${i + 1}`,
        messageCount: i + 1,
      });

      // Wait for subscription event
      const event = await waitForEventWithId(session.id);
      const latency = event.receivedAt - startTime;
      updateLatencies.push(latency);
      process.stdout.write(
        `      Trial ${i + 1}/${NUM_TRIALS}: ${latency.toFixed(1)}ms (${event.action})\n`
      );
    } catch (err) {
      console.error(`      Trial ${i + 1}/${NUM_TRIALS}: FAILED - ${err.message}`);
    }
  }

  // Step 6: Cleanup and report
  console.log("\n[6/6] Cleaning up test sessions...");
  for (const session of createdSessions) {
    try {
      await pb.collection("sessions").delete(session.id);
    } catch (err) {
      // Ignore cleanup errors
    }
  }
  console.log(`      Deleted ${createdSessions.length} test sessions`);

  // Unsubscribe
  await pb.collection("sessions").unsubscribe("*");

  // Calculate statistics
  const calcStats = (arr) => {
    if (arr.length === 0) return { min: 0, max: 0, avg: 0, p50: 0, p95: 0 };
    const sorted = [...arr].sort((a, b) => a - b);
    const sum = arr.reduce((a, b) => a + b, 0);
    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / arr.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
    };
  };

  const createStats = calcStats(createLatencies);
  const updateStats = calcStats(updateLatencies);
  const allStats = calcStats([...createLatencies, ...updateLatencies]);

  // Report results
  console.log("\n" + "=".repeat(60));
  console.log("RESULTS");
  console.log("=".repeat(60));

  console.log("\nCREATE Operations:");
  console.log(`  Trials:  ${createLatencies.length}`);
  console.log(`  Min:     ${createStats.min.toFixed(1)}ms`);
  console.log(`  Max:     ${createStats.max.toFixed(1)}ms`);
  console.log(`  Avg:     ${createStats.avg.toFixed(1)}ms`);
  console.log(`  P50:     ${createStats.p50.toFixed(1)}ms`);
  console.log(`  P95:     ${createStats.p95.toFixed(1)}ms`);

  console.log("\nUPDATE Operations:");
  console.log(`  Trials:  ${updateLatencies.length}`);
  console.log(`  Min:     ${updateStats.min.toFixed(1)}ms`);
  console.log(`  Max:     ${updateStats.max.toFixed(1)}ms`);
  console.log(`  Avg:     ${updateStats.avg.toFixed(1)}ms`);
  console.log(`  P50:     ${updateStats.p50.toFixed(1)}ms`);
  console.log(`  P95:     ${updateStats.p95.toFixed(1)}ms`);

  console.log("\nCOMBINED (All Operations):");
  console.log(`  Trials:  ${createLatencies.length + updateLatencies.length}`);
  console.log(`  Min:     ${allStats.min.toFixed(1)}ms`);
  console.log(`  Max:     ${allStats.max.toFixed(1)}ms`);
  console.log(`  Avg:     ${allStats.avg.toFixed(1)}ms`);
  console.log(`  P50:     ${allStats.p50.toFixed(1)}ms`);
  console.log(`  P95:     ${allStats.p95.toFixed(1)}ms`);

  // Pass/Fail verdict
  const TARGET_LATENCY = 500;
  const passed = allStats.p95 < TARGET_LATENCY;

  console.log("\n" + "=".repeat(60));
  if (passed) {
    console.log(`VERDICT: PASS - P95 latency (${allStats.p95.toFixed(1)}ms) < ${TARGET_LATENCY}ms target`);
  } else {
    console.log(`VERDICT: FAIL - P95 latency (${allStats.p95.toFixed(1)}ms) >= ${TARGET_LATENCY}ms target`);
  }
  console.log("=".repeat(60));

  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
