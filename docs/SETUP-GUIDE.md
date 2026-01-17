# Setup Guide: claude-code-sync

This guide is for you, the maintainer. It covers everything you need to do to get the plugin working with your existing webui.

## Prerequisites

- Your opencode-sync-webui is deployed on Convex
- You have access to modify the Convex schema and functions
- Claude Code is installed on your machine for testing

## Step 1: Update the Convex Schema

Add the `source` field to your existing tables. In `convex/schema.ts`:

```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sessions: defineTable({
    sessionId: v.string(),
    projectName: v.string(),
    workingDirectory: v.string(),
    gitBranch: v.optional(v.string()),
    gitRemote: v.optional(v.string()),
    startedAt: v.string(),
    endedAt: v.optional(v.string()),
    
    // Add this field
    source: v.union(v.literal("opencode"), v.literal("claude-code")),
    
    // Claude Code specific fields
    startType: v.optional(v.string()),
    endReason: v.optional(v.string()),
    messageCount: v.optional(v.number()),
    toolCallCount: v.optional(v.number()),
    tokenUsage: v.optional(v.object({
      input: v.number(),
      output: v.number(),
    })),
    model: v.optional(v.string()),
  })
    .index("by_session_id", ["sessionId"])
    .index("by_source", ["source"])
    .index("by_project", ["projectName"]),

  events: defineTable({
    sessionId: v.string(),
    eventType: v.string(),
    payload: v.any(),
    timestamp: v.string(),
    source: v.union(v.literal("opencode"), v.literal("claude-code")),
  })
    .index("by_session", ["sessionId"])
    .index("by_type", ["eventType"]),

  messages: defineTable({
    sessionId: v.string(),
    role: v.string(),
    content: v.string(),
    timestamp: v.optional(v.string()),
    source: v.union(v.literal("opencode"), v.literal("claude-code")),
  })
    .index("by_session", ["sessionId"]),
});
```

Push the schema:

```bash
npx convex dev
```

## Step 2: Add the Sync Functions

Create `convex/sync.ts`:

```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const recordEvent = mutation({
  args: {
    eventType: v.string(),
    payload: v.any(),
    timestamp: v.string(),
    source: v.union(v.literal("opencode"), v.literal("claude-code")),
  },
  handler: async (ctx, args) => {
    const { eventType, payload, timestamp, source } = args;
    const sessionId = payload.sessionId;

    // Handle session lifecycle events
    if (eventType === "session_start") {
      const existing = await ctx.db
        .query("sessions")
        .withIndex("by_session_id", (q) => q.eq("sessionId", sessionId))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          startedAt: timestamp,
          gitBranch: payload.gitBranch,
          startType: payload.startType,
        });
      } else {
        await ctx.db.insert("sessions", {
          sessionId,
          projectName: payload.projectName || "unknown",
          workingDirectory: payload.workingDirectory || "",
          gitBranch: payload.gitBranch,
          gitRemote: payload.gitRemote,
          startedAt: timestamp,
          source,
          startType: payload.startType,
        });
      }
    }

    if (eventType === "session_end" || eventType === "manual_sync") {
      const existing = await ctx.db
        .query("sessions")
        .withIndex("by_session_id", (q) => q.eq("sessionId", sessionId))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          endedAt: timestamp,
          endReason: payload.endReason,
          messageCount: payload.messageCount,
          toolCallCount: payload.toolCallCount,
          tokenUsage: payload.tokenUsage,
          model: payload.model,
        });
      } else {
        // Create session if it doesn't exist (manual sync case)
        await ctx.db.insert("sessions", {
          sessionId,
          projectName: payload.projectName || "unknown",
          workingDirectory: payload.workingDirectory || "",
          startedAt: timestamp,
          endedAt: timestamp,
          source,
          messageCount: payload.messageCount,
          toolCallCount: payload.toolCallCount,
          tokenUsage: payload.tokenUsage,
          model: payload.model,
        });
      }

      // Store messages
      if (payload.messages && Array.isArray(payload.messages)) {
        for (const message of payload.messages) {
          await ctx.db.insert("messages", {
            sessionId,
            role: message.role,
            content: message.content,
            timestamp: message.timestamp || timestamp,
            source,
          });
        }
      }
    }

    // Store raw event for analytics
    await ctx.db.insert("events", {
      sessionId,
      eventType,
      payload,
      timestamp,
      source,
    });

    return { success: true };
  },
});

export const healthCheck = query({
  args: {},
  handler: async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  },
});

export const getSessions = query({
  args: {
    source: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let sessionsQuery = ctx.db.query("sessions");

    if (args.source && args.source !== "all") {
      sessionsQuery = sessionsQuery.filter((q) =>
        q.eq(q.field("source"), args.source)
      );
    }

    return await sessionsQuery.order("desc").take(args.limit || 50);
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const sessions = await ctx.db.query("sessions").collect();

    const opencodeSessions = sessions.filter((s) => s.source === "opencode");
    const claudeCodeSessions = sessions.filter((s) => s.source === "claude-code");

    let totalTokens = 0;
    for (const session of sessions) {
      if (session.tokenUsage) {
        totalTokens += session.tokenUsage.input + session.tokenUsage.output;
      }
    }

    return {
      totalSessions: sessions.length,
      opencodeSessions: opencodeSessions.length,
      claudeCodeSessions: claudeCodeSessions.length,
      totalTokens,
    };
  },
});
```

## Step 3: Run the Migration

If you have existing OpenCode sessions, migrate them to include the source field.

Create `convex/migrations.ts`:

```typescript
import { internalMutation } from "./_generated/server";

export const addSourceToExisting = internalMutation({
  handler: async (ctx) => {
    const sessions = await ctx.db.query("sessions").collect();
    let updated = 0;

    for (const session of sessions) {
      if (!session.source) {
        await ctx.db.patch(session._id, { source: "opencode" });
        updated++;
      }
    }

    const events = await ctx.db.query("events").collect();
    let eventsUpdated = 0;

    for (const event of events) {
      if (!event.source) {
        await ctx.db.patch(event._id, { source: "opencode" });
        eventsUpdated++;
      }
    }

    return { sessions: updated, events: eventsUpdated };
  },
});
```

Run it:

```bash
npx convex run migrations:addSourceToExisting
```

## Step 4: Test the Plugin Locally

Clone or copy the claude-code-sync plugin:

```bash
git clone https://github.com/yourusername/claude-code-sync.git
```

Create your config file:

```bash
cat > ~/.claude-code-sync.json << EOF
{
  "convex_url": "https://your-deployment.convex.cloud",
  "auto_sync": true,
  "sync_tool_calls": true
}
EOF
```

Start Claude Code with the plugin:

```bash
claude --plugin-dir /path/to/claude-code-sync
```

Test the connection:

```
/claude-code-sync:sync-status
```

You should see:

```
🔄 Claude Code Sync Status

========================================

📋 Configuration:
   Convex URL: https://your-deployment.convex.cloud
   API Key: (not set)
   Auto Sync: enabled
   Sync Tool Calls: enabled
   Sync Thinking: disabled

📁 Config File:
   /Users/you/.claude-code-sync.json
   exists

🔌 Connection:
   ✅ Connected

========================================
```

## Step 5: Test a Full Session

1. Start a new Claude Code session
2. Ask Claude to do something (create a file, run a command)
3. End the session with `/exit` or Ctrl+C
4. Check your Convex dashboard for the new session
5. Verify the source shows as "claude-code"

## Step 6: Update the WebUI (Optional)

See `PRD-WEBUI-UPDATES.md` for detailed UI changes to add source filtering and badges.

Quick version - add a filter to your sessions list:

```tsx
const [source, setSource] = useState<"all" | "opencode" | "claude-code">("all");

const sessions = useQuery(api.sync.getSessions, { source });
```

## Step 7: Publish the Plugin

When you're ready to share:

1. Push to GitHub
2. Register with Claude Code marketplace (if available)
3. Or share the repo URL for manual installation

Users install with:

```bash
/plugin install yourusername/claude-code-sync
```

## Troubleshooting

### Events not appearing in Convex

Check the Claude Code terminal for errors:

```
claude-code-sync: Failed to send event: ...
```

Common issues:
- Wrong Convex URL (should end in `.convex.cloud`)
- Network connectivity
- Convex deployment not running

### Session not syncing on end

Make sure `auto_sync` is true in your config. Or use `/claude-code-sync:sync-now` to manually sync.

### Schema errors

If you see schema validation errors, make sure all fields have the correct types. The `source` field must be exactly `"opencode"` or `"claude-code"`.

### Hook not firing

Check that the plugin is loaded:

```
/plugins
```

You should see `claude-code-sync` in the list.

## Directory Structure

After setup, your projects should look like:

```
opencode-sync-webui/
├── convex/
│   ├── schema.ts          # Updated with source field
│   ├── sync.ts            # New sync functions
│   └── migrations.ts      # Migration script
├── components/
│   └── ...                # UI components
└── ...

claude-code-sync/
├── .claude-plugin/
│   └── plugin.json
├── hooks/
│   ├── session_start.py
│   ├── post_tool_use.py
│   ├── user_prompt.py
│   ├── stop.py
│   └── session_end.py
├── commands/
│   ├── commands.json
│   ├── sync-status.py
│   └── sync-now.py
├── docs/
│   └── PRD-WEBUI-UPDATES.md
└── README.md
```

## Next Steps

- Add authentication if needed (API key validation in Convex)
- Set up team/organization support
- Add cost tracking by calculating token costs
- Build comparison views between OpenCode and Claude Code sessions
