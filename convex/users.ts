import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { nanoid } from "nanoid";

// Get current user from auth
export const me = query({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("users"),
      email: v.optional(v.string()),
      name: v.optional(v.string()),
      avatarUrl: v.optional(v.string()),
      hasApiKey: v.boolean(),
      createdAt: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosId", identity.subject))
      .first();

    if (!user) return null;

    return {
      _id: user._id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      hasApiKey: !!user.apiKey,
      createdAt: user.createdAt,
    };
  },
});

// Get or create user from identity (called on login)
export const getOrCreate = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosId", identity.subject))
      .first();

    if (existing) {
      // Update if info changed
      if (
        existing.email !== identity.email ||
        existing.name !== identity.name
      ) {
        await ctx.db.patch(existing._id, {
          email: identity.email,
          name: identity.name,
          updatedAt: Date.now(),
        });
      }
      return existing._id;
    }

    return await ctx.db.insert("users", {
      workosId: identity.subject,
      email: identity.email,
      name: identity.name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

// Generate API key for external access
export const generateApiKey = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosId", identity.subject))
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosId", identity.subject))
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

// Get user stats
export const stats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosId", identity.subject))
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

// Internal: get user by WorkOS ID
export const getByWorkosId = internalMutation({
  args: { workosId: v.string() },
  handler: async (ctx, { workosId }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosId", workosId))
      .first();

    if (existing) return existing;

    // Create if doesn't exist
    const userId = await ctx.db.insert("users", {
      workosId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return await ctx.db.get(userId);
  },
});
