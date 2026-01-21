import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery, action } from "./_generated/server";
import { internal } from "./_generated/api";
import { nanoid } from "nanoid";

// Default user ID for single-user homelab mode
const DEFAULT_USER_EMAIL = process.env.DEFAULT_USER_EMAIL || "user@example.com";

// Get current user - in single-user mode, returns the default user
export const me = query({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("users"),
      email: v.optional(v.string()),
      name: v.optional(v.string()),
      avatarUrl: v.optional(v.string()),
      hasApiKey: v.boolean(),
      enabledAgents: v.optional(v.array(v.string())),
      createdAt: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx) => {
    // Single-user mode: get default user by email
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", DEFAULT_USER_EMAIL))
      .first();

    if (!user) return null;

    return {
      _id: user._id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      hasApiKey: !!user.apiKey,
      enabledAgents: user.enabledAgents,
      createdAt: user.createdAt,
    };
  },
});

// Internal: get default user for actions
export const getDefaultUser = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", DEFAULT_USER_EMAIL))
      .first();
  },
});

// Get or create user - single-user mode, creates default user if not exists
export const getOrCreate = mutation({
  args: {},
  handler: async (ctx) => {
    // Single-user mode: find or create by email
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", DEFAULT_USER_EMAIL))
      .first();

    if (existing) {
      return existing._id;
    }

    // Create default user
    return await ctx.db.insert("users", {
      workosId: "authelia-default", // Placeholder for schema compatibility
      email: DEFAULT_USER_EMAIL,
      name: "David",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

// Generate API key for external access
export const generateApiKey = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", DEFAULT_USER_EMAIL))
      .first();

    if (!user) throw new Error("User not found");

    // Generate secure API key
    const apiKey = `osk_${nanoid(32)}`;

    await ctx.db.patch(user._id, {
      apiKey,
      apiKeyCreatedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return apiKey;
  },
});

// Revoke API key
export const revokeApiKey = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", DEFAULT_USER_EMAIL))
      .first();

    if (!user) throw new Error("User not found");

    await ctx.db.patch(user._id, {
      apiKey: undefined,
      apiKeyCreatedAt: undefined,
      updatedAt: Date.now(),
    });

    return true;
  },
});

// Update enabled AI coding agents for source filter dropdown
export const updateEnabledAgents = mutation({
  args: {
    enabledAgents: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { enabledAgents }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", DEFAULT_USER_EMAIL))
      .first();

    if (!user) throw new Error("User not found");

    await ctx.db.patch(user._id, {
      enabledAgents,
      updatedAt: Date.now(),
    });

    return null;
  },
});

// Get user stats
export const stats = query({
  args: {},
  handler: async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", DEFAULT_USER_EMAIL))
      .first();

    if (!user) return null;

    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const totalTokens = sessions.reduce((acc, s) => acc + s.totalTokens, 0);
    const totalCost = sessions.reduce((acc, s) => acc + s.cost, 0);
    const totalMessages = sessions.reduce((acc, s) => acc + s.messageCount, 0);
    const totalDuration = sessions.reduce(
      (acc, s) => acc + (s.durationMs || 0),
      0
    );

    // Model usage breakdown
    const modelUsage: Record<string, number> = {};
    for (const s of sessions) {
      const model = s.model || "unknown";
      modelUsage[model] = (modelUsage[model] || 0) + s.totalTokens;
    }

    return {
      sessionCount: sessions.length,
      messageCount: totalMessages,
      totalTokens,
      totalCost,
      totalDurationMs: totalDuration,
      modelUsage,
    };
  },
});

// Internal: get user by API key
export const getByApiKey = internalMutation({
  args: { apiKey: v.string() },
  handler: async (ctx, { apiKey }) => {
    return await ctx.db
      .query("users")
      .withIndex("by_api_key", (q) => q.eq("apiKey", apiKey))
      .first();
  },
});

// Internal: get user by WorkOS ID (kept for API compatibility)
export const getByWorkosId = internalMutation({
  args: { workosId: v.string() },
  handler: async (ctx, { workosId }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosId", workosId))
      .first();

    if (existing) return existing;

    // Create if does not exist
    const userId = await ctx.db.insert("users", {
      workosId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return await ctx.db.get(userId);
  },
});

// Delete all user data (keeps account intact)
export const deleteAllData = mutation({
  args: {},
  returns: v.object({ deleted: v.boolean(), counts: v.object({
    sessions: v.number(),
    messages: v.number(),
    parts: v.number(),
    embeddings: v.number(),
    apiLogs: v.number(),
  })}),
  handler: async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", DEFAULT_USER_EMAIL))
      .first();

    if (!user) throw new Error("User not found");

    const counts = await deleteUserData(ctx, user._id);

    return { deleted: true, counts };
  },
});

// Internal: delete all user data
export const deleteAllDataInternal = internalMutation({
  args: { userId: v.id("users"), deleteUser: v.boolean() },
  returns: v.object({
    sessions: v.number(),
    messages: v.number(),
    parts: v.number(),
    embeddings: v.number(),
    apiLogs: v.number(),
  }),
  handler: async (ctx, { userId, deleteUser }) => {
    const counts = await deleteUserData(ctx, userId);
    
    if (deleteUser) {
      await ctx.db.delete(userId);
    }

    return counts;
  },
});

// Helper function to delete all user data
async function deleteUserData(ctx: any, userId: any) {
  const counts = {
    sessions: 0,
    messages: 0,
    parts: 0,
    embeddings: 0,
    apiLogs: 0,
  };

  const sessions = await ctx.db
    .query("sessions")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();

  for (const session of sessions) {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_session", (q: any) => q.eq("sessionId", session._id))
      .collect();

    for (const message of messages) {
      const parts = await ctx.db
        .query("parts")
        .withIndex("by_message", (q: any) => q.eq("messageId", message._id))
        .collect();

      for (const part of parts) {
        await ctx.db.delete(part._id);
        counts.parts++;
      }

      await ctx.db.delete(message._id);
      counts.messages++;
    }

    await ctx.db.delete(session._id);
    counts.sessions++;
  }

  const embeddings = await ctx.db
    .query("sessionEmbeddings")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();

  for (const embedding of embeddings) {
    await ctx.db.delete(embedding._id);
    counts.embeddings++;
  }

  const apiLogs = await ctx.db
    .query("apiLogs")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();

  for (const log of apiLogs) {
    await ctx.db.delete(log._id);
    counts.apiLogs++;
  }

  return counts;
}

// Internal query to get user info for deletion
export const getUserForDeletion = internalMutation({
  args: { workosId: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("users"),
      workosId: v.string(),
    }),
    v.null()
  ),
  handler: async (ctx, { workosId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosId", workosId))
      .first();

    if (!user) return null;

    return {
      _id: user._id,
      workosId: user.workosId,
    };
  },
});

// Delete account action - simplified for single-user mode
export const deleteAccount = action({
  args: {},
  returns: v.object({ deleted: v.boolean(), error: v.optional(v.string()) }),
  handler: async (ctx): Promise<{ deleted: boolean; error?: string }> => {
    // In single-user mode, get the default user
    const user = await ctx.runQuery(internal.users.getDefaultUser, {});

    if (!user) {
      return { deleted: false, error: "User not found" };
    }

    try {
      await ctx.runMutation(internal.users.deleteAllDataInternal, {
        userId: user._id,
        deleteUser: true,
      });

      return { deleted: true };
    } catch (error) {
      return {
        deleted: false,
        error: `Failed to delete account: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
