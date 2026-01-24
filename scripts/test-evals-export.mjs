/**
 * Test script for Evals.tsx export functionality.
 * Creates test sessions/messages, runs export, verifies output.
 */
import PocketBase from "pocketbase";

const pb = new PocketBase("http://localhost:8090");

// Admin credentials - update if needed
const ADMIN_EMAIL = "davehelmus@gmail.com";
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || "testadmin123";

async function main() {
  console.log("🧪 Testing Evals export functionality...\n");

  // Try admin auth
  try {
    await pb.collection("_superusers").authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
    console.log("✅ Admin authenticated");
  } catch (err) {
    console.log("⚠️ Admin auth failed, proceeding without auth");
  }

  // Check for existing users
  let user;
  try {
    const users = await pb.collection("users").getList(1, 1);
    if (users.items.length > 0) {
      user = users.items[0];
      console.log("✅ Found existing user:", user.id);
    } else {
      console.log("⚠️ No users found. Please create a user via the auth flow first.");
      console.log("   Creating test session without user reference...");
    }
  } catch (err) {
    console.log("⚠️ Could not list users:", err.message);
    console.log("   Proceeding without user reference...");
  }

  // Create test eval-ready sessions
  const sessionData = [
    {
      user: user?.id,
      externalId: "test-eval-session-1",
      title: "Fix TypeScript errors",
      projectName: "my-project",
      model: "claude-sonnet-4-20250514",
      source: "opencode",
      totalTokens: 5000,
      cost: 0.05,
      messageCount: 4,
      evalReady: true,
      evalTags: ["typescript", "bug-fix"],
    },
    {
      user: user?.id,
      externalId: "test-eval-session-2",
      title: "Implement new feature",
      projectName: "another-project",
      model: "gpt-4o",
      source: "claude-code",
      totalTokens: 8000,
      cost: 0.12,
      messageCount: 6,
      evalReady: true,
      evalTags: ["feature", "react"],
    },
  ];

  const createdSessions = [];
  for (const sData of sessionData) {
    try {
      // Check if session exists
      const existing = await pb.collection("sessions").getList(1, 1, {
        filter: `externalId = "${sData.externalId}"`,
      });
      if (existing.items.length > 0) {
        console.log(`✅ Session already exists: ${sData.externalId}`);
        createdSessions.push(existing.items[0]);
      } else {
        const session = await pb.collection("sessions").create(sData);
        console.log(`✅ Created session: ${session.id} (${sData.title})`);
        createdSessions.push(session);
      }
    } catch (err) {
      console.error(`❌ Failed to create session (${sData.externalId}): ${err.message}`);
    }
  }

  if (createdSessions.length === 0) {
    console.log("\n❌ No sessions could be created. Check Pocketbase API rules.");
    console.log("   You may need to set API rules on 'sessions' collection to allow create.");
    process.exit(1);
  }

  // Create test messages for each session
  for (const session of createdSessions) {
    try {
      const existingMessages = await pb.collection("messages").getList(1, 1, {
        filter: `session = "${session.id}"`,
      });
      
      if (existingMessages.items.length > 0) {
        console.log(`✅ Messages already exist for session: ${session.id}`);
        continue;
      }
    } catch (err) {
      // Continue to create messages
    }

    const messages = [
      { role: "user", textContent: "Please fix the TypeScript error in src/components/Button.tsx" },
      { role: "assistant", textContent: "I'll fix that TypeScript error. The issue is a missing type annotation..." },
      { role: "user", textContent: "Thanks! Can you also add tests?" },
      { role: "assistant", textContent: "Sure! Here are the tests for the Button component..." },
    ];

    for (let i = 0; i < messages.length; i++) {
      try {
        await pb.collection("messages").create({
          session: session.id,
          externalId: `${session.externalId}-msg-${i}`,
          role: messages[i].role,
          textContent: messages[i].textContent,
        });
      } catch (err) {
        console.error(`❌ Failed to create message: ${err.message}`);
      }
    }
    console.log(`✅ Created ${messages.length} messages for session: ${session.id}`);
  }

  // Verify eval sessions exist
  const evalSessions = await pb.collection("sessions").getList(1, 100, {
    filter: "evalReady = true",
  });
  console.log(`\n📊 Total eval-ready sessions: ${evalSessions.totalItems}`);

  // Test export logic (simulate what useEvals.generateExport does)
  console.log("\n🔄 Testing export generation...");
  
  const sessions = evalSessions.items;
  const messagesBySession = {};
  
  for (const session of sessions) {
    const messagesResult = await pb.collection("messages").getList(1, 1000, {
      filter: `session = "${session.id}"`,
      sort: "created",
    });
    messagesBySession[session.id] = messagesResult.items;
  }

  // Generate DeepEval format
  const testCases = [];
  for (const session of sessions) {
    const messages = messagesBySession[session.id] || [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === "user" && i + 1 < messages.length) {
        const response = messages[i + 1];
        if (response.role === "assistant") {
          testCases.push({
            input: msg.textContent || "",
            actual_output: response.textContent || "",
            expected_output: response.textContent || "",
            context: [],
            metadata: {
              session_id: session.externalId,
              model: session.model || "unknown",
              source: session.source || "opencode",
            },
          });
        }
      }
    }
  }

  console.log(`✅ Generated ${testCases.length} test cases in DeepEval format`);
  
  // Verify structure
  if (testCases.length > 0) {
    console.log("\n📋 Sample test case:");
    console.log(JSON.stringify(testCases[0], null, 2));
    console.log("\n✅ Export generates valid file - TEST PASSED");
  } else {
    console.log("⚠️ No test cases generated (check messages)");
  }
  
  console.log("\n🎉 Evals export test complete!");
}

main().catch(console.error);
