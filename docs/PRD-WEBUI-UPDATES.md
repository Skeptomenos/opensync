# PRD: Adding Claude Code Support to opencode-sync-webui

## Overview

This document outlines the changes needed to support Claude Code sessions in the existing opencode-sync-webui. The goal is to unify session tracking from both OpenCode and Claude Code into a single dashboard.

## Background

The webui currently tracks OpenCode sessions via an MCP server that syncs to Convex. Claude Code uses a different architecture (hooks instead of MCP), but the data model is similar enough that both can share the same backend and UI with minimal changes.

## Goals

1. Accept session data from Claude Code's hook-based sync plugin
2. Display sessions from both sources in a unified view
3. Allow filtering by source (OpenCode vs Claude Code)
4. Maintain backward compatibility with existing OpenCode data

## Non-Goals

- Real-time streaming (Claude Code hooks are event-based, not streaming)
- Bidirectional sync (this is read-only tracking)
- Session replay functionality

---

## Schema Changes

### sessions table

Add a `source` field to distinguish between OpenCode and Claude Code sessions:

```typescript
// convex/schema.ts

sessions: defineTable({
  // Existing fields
  sessionId: v.string(),
  projectName: v.string(),
  workingDirectory: v.string(),
  gitBranch: v.optional(v.string()),
  gitRemote: v.optional(v.string()),
  startedAt: v.string(),
  endedAt: v.optional(v.string()),
  
  // New field
  source: v.union(v.literal("opencode"), v.literal("claude-code")),
  
  // Claude Code specific
  startType: v.optional(v.string()), // "startup", "resume", "clear"
  endReason: v.optional(v.string()),
})
  .index("by_session_id", ["sessionId"])
  .index("by_source", ["source"])
  .index("by_project", ["projectName"])
```

### events table

The events table can remain mostly unchanged. Add source tracking:

```typescript
// convex/schema.ts

events: defineTable({
  sessionId: v.string(),
  eventType: v.string(),
  payload: v.any(),
  timestamp: v.string(),
  source: v.union(v.literal("opencode"), v.literal("claude-code")),
})
  .index("by_session", ["sessionId"])
  .index("by_type", ["eventType"])
```

---

## New Convex Functions

### sync:recordEvent

A new mutation that handles events from Claude Code:

```typescript
// convex/sync.ts

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
    
    // Handle session_start: create or update session
    if (eventType === "session_start") {
      const existing = await ctx.db
        .query("sessions")
        .withIndex("by_session_id", (q) => q.eq("sessionId", payload.sessionId))
        .first();
      
      if (existing) {
        await ctx.db.patch(existing._id, {
          startedAt: timestamp,
          gitBranch: payload.gitBranch,
          startType: payload.startType,
        });
      } else {
        await ctx.db.insert("sessions", {
          sessionId: payload.sessionId,
          projectName: payload.projectName,
          workingDirectory: payload.workingDirectory,
          gitBranch: payload.gitBranch,
          gitRemote: payload.gitRemote,
          startedAt: timestamp,
          source,
          startType: payload.startType,
        });
      }
    }
    
    // Handle session_end: update session with final data
    if (eventType === "session_end" || eventType === "manual_sync") {
      const existing = await ctx.db
        .query("sessions")
        .withIndex("by_session_id", (q) => q.eq("sessionId", payload.sessionId))
        .first();
      
      if (existing) {
        await ctx.db.patch(existing._id, {
          endedAt: timestamp,
          endReason: payload.endReason,
          // Store aggregated data
          messageCount: payload.messageCount,
          toolCallCount: payload.toolCallCount,
          tokenUsage: payload.tokenUsage,
          model: payload.model,
        });
      }
      
      // Store messages if provided
      if (payload.messages && payload.messages.length > 0) {
        for (const message of payload.messages) {
          await ctx.db.insert("messages", {
            sessionId: payload.sessionId,
            role: message.role,
            content: message.content,
            timestamp: message.timestamp || timestamp,
            source,
          });
        }
      }
    }
    
    // Store the raw event
    await ctx.db.insert("events", {
      sessionId: payload.sessionId,
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
```

### sync:getSessions

Update the sessions query to support filtering:

```typescript
// convex/sync.ts

export const getSessions = query({
  args: {
    source: v.optional(v.union(v.literal("opencode"), v.literal("claude-code"), v.literal("all"))),
    projectName: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db.query("sessions");
    
    if (args.source && args.source !== "all") {
      query = query.withIndex("by_source", (q) => q.eq("source", args.source));
    }
    
    const sessions = await query
      .order("desc")
      .take(args.limit || 50);
    
    // Filter by project if specified
    if (args.projectName) {
      return sessions.filter((s) => s.projectName === args.projectName);
    }
    
    return sessions;
  },
});
```

---

## UI Changes

### SessionList component

Add a source filter and badge:

```tsx
// components/SessionList.tsx

interface SessionListProps {
  sessions: Session[];
}

export function SessionList({ sessions }: SessionListProps) {
  const [sourceFilter, setSourceFilter] = useState<"all" | "opencode" | "claude-code">("all");
  
  const filteredSessions = sessions.filter((s) => 
    sourceFilter === "all" || s.source === sourceFilter
  );
  
  return (
    <div>
      {/* Source filter tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setSourceFilter("all")}
          className={sourceFilter === "all" ? "active" : ""}
        >
          All
        </button>
        <button
          onClick={() => setSourceFilter("opencode")}
          className={sourceFilter === "opencode" ? "active" : ""}
        >
          OpenCode
        </button>
        <button
          onClick={() => setSourceFilter("claude-code")}
          className={sourceFilter === "claude-code" ? "active" : ""}
        >
          Claude Code
        </button>
      </div>
      
      {/* Session list */}
      <div className="space-y-2">
        {filteredSessions.map((session) => (
          <SessionCard key={session._id} session={session} />
        ))}
      </div>
    </div>
  );
}
```

### SessionCard component

Add source badge:

```tsx
// components/SessionCard.tsx

export function SessionCard({ session }: { session: Session }) {
  return (
    <div className="p-4 border rounded-lg">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{session.projectName}</h3>
        <SourceBadge source={session.source} />
      </div>
      {/* ... rest of card */}
    </div>
  );
}

function SourceBadge({ source }: { source: "opencode" | "claude-code" }) {
  const colors = {
    opencode: "bg-green-100 text-green-800",
    "claude-code": "bg-orange-100 text-orange-800",
  };
  
  const labels = {
    opencode: "OpenCode",
    "claude-code": "Claude Code",
  };
  
  return (
    <span className={`px-2 py-1 text-xs rounded ${colors[source]}`}>
      {labels[source]}
    </span>
  );
}
```

### Dashboard stats

Update dashboard to show stats by source:

```tsx
// components/Dashboard.tsx

export function Dashboard() {
  const stats = useQuery(api.sync.getStats);
  
  return (
    <div className="grid grid-cols-4 gap-4">
      <StatCard title="Total Sessions" value={stats.totalSessions} />
      <StatCard title="OpenCode" value={stats.opencodeSessions} />
      <StatCard title="Claude Code" value={stats.claudeCodeSessions} />
      <StatCard title="Total Tokens" value={formatTokens(stats.totalTokens)} />
    </div>
  );
}
```

---

## Migration

If you have existing data, run this migration to add the source field:

```typescript
// convex/migrations/addSource.ts

import { internalMutation } from "../_generated/server";

export const addSourceField = internalMutation({
  handler: async (ctx) => {
    const sessions = await ctx.db.query("sessions").collect();
    
    for (const session of sessions) {
      if (!session.source) {
        await ctx.db.patch(session._id, {
          source: "opencode", // Existing sessions are from OpenCode
        });
      }
    }
    
    const events = await ctx.db.query("events").collect();
    
    for (const event of events) {
      if (!event.source) {
        await ctx.db.patch(event._id, {
          source: "opencode",
        });
      }
    }
    
    return { migratedSessions: sessions.length, migratedEvents: events.length };
  },
});
```

Run with:

```bash
npx convex run migrations/addSource:addSourceField
```

---

## API Endpoints

The Claude Code plugin calls these endpoints:

### POST /api/mutation

```json
{
  "path": "sync:recordEvent",
  "args": {
    "eventType": "session_start" | "tool_use" | "user_prompt" | "response_complete" | "session_end" | "manual_sync",
    "payload": { ... },
    "timestamp": "2025-01-16T12:00:00Z",
    "source": "claude-code"
  }
}
```

### POST /api/query

```json
{
  "path": "sync:healthCheck",
  "args": {}
}
```

Response:

```json
{
  "status": "ok",
  "timestamp": "2025-01-16T12:00:00Z"
}
```

---

## Testing

1. Install the Claude Code plugin
2. Configure it with your Convex URL
3. Start a Claude Code session
4. Run `/claude-code-sync:sync-status` to verify connection
5. End the session and check the webui for the new entry
6. Verify the source badge shows "Claude Code"

---

## Rollout Plan

1. **Phase 1**: Deploy schema changes and new Convex functions
2. **Phase 2**: Run migration for existing data
3. **Phase 3**: Deploy UI updates with source filtering
4. **Phase 4**: Publish the Claude Code plugin
5. **Phase 5**: Update documentation

---

## Future Considerations

- Real-time updates via Convex subscriptions
- Session comparison between OpenCode and Claude Code
- Cost tracking per source
- Team/organization support
- Export functionality
