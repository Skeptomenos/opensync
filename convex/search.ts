import { v } from "convex/values";
import { query, action, internalQuery } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// Type definition for session results
type SessionSearchResult = {
  _id: Id<"sessions">;
  externalId: string;
  title?: string;
  projectPath?: string;
  projectName?: string;
  model?: string;
  totalTokens: number;
  cost: number;
  isPublic: boolean;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
};

// Type definition for user
type UserResult = {
  _id: Id<"users">;
  _creationTime: number;
  workosId: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  apiKey?: string;
  apiKeyCreatedAt?: number;
  createdAt: number;
  updatedAt: number;
} | null;

// Full-text search on sessions
export const searchSessions = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("sessions"),
      externalId: v.string(),
      title: v.optional(v.string()),
      projectPath: v.optional(v.string()),
      projectName: v.optional(v.string()),
      model: v.optional(v.string()),
      totalTokens: v.number(),
      cost: v.number(),
      isPublic: v.boolean(),
      messageCount: v.number(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
  ),
  handler: async (ctx, { query: searchQuery, limit = 20 }) => {
    if (!searchQuery.trim()) return [];

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosId", identity.subject))
      .first();

    if (!user) return [];

    const results = await ctx.db
      .query("sessions")
      .withSearchIndex("search_sessions", (q) =>
        q.search("searchableText", searchQuery).eq("userId", user._id)
      )
      .take(limit);

    return results.map((s) => ({
      _id: s._id,
      externalId: s.externalId,
      title: s.title,
      projectPath: s.projectPath,
      projectName: s.projectName,
      model: s.model,
      totalTokens: s.totalTokens,
      cost: s.cost,
      isPublic: s.isPublic,
      messageCount: s.messageCount,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  },
});

// Full-text search on messages
export const searchMessages = query({
  args: {
    query: v.string(),
    sessionId: v.optional(v.id("sessions")),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("messages"),
      _creationTime: v.number(),
      sessionId: v.id("sessions"),
      externalId: v.string(),
      role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
      textContent: v.optional(v.string()),
      model: v.optional(v.string()),
      promptTokens: v.optional(v.number()),
      completionTokens: v.optional(v.number()),
      durationMs: v.optional(v.number()),
      createdAt: v.number(),
      sessionTitle: v.optional(v.string()),
      projectPath: v.optional(v.string()),
    })
  ),
  handler: async (ctx, { query: searchQuery, sessionId, limit = 50 }) => {
    if (!searchQuery.trim()) return [];

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosId", identity.subject))
      .first();

    if (!user) return [];

    // Get user's sessions
    const userSessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const sessionIds = new Set(userSessions.map((s) => s._id));

    let results;
    if (sessionId) {
      if (!sessionIds.has(sessionId)) return [];

      results = await ctx.db
        .query("messages")
        .withSearchIndex("search_messages", (q) =>
          q.search("textContent", searchQuery).eq("sessionId", sessionId)
        )
        .take(limit);
    } else {
      results = await ctx.db
        .query("messages")
        .withSearchIndex("search_messages", (q) =>
          q.search("textContent", searchQuery)
        )
        .take(limit * 2);

      results = results.filter((msg) => sessionIds.has(msg.sessionId));
    }

    // Attach session info
    return Promise.all(
      results.slice(0, limit).map(async (msg) => {
        const session = await ctx.db.get(msg.sessionId);
        return {
          ...msg,
          sessionTitle: session?.title,
          projectPath: session?.projectPath,
        };
      })
    );
  },
});

// Semantic search using vector embeddings
export const semanticSearch = action({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("sessions"),
      externalId: v.string(),
      title: v.optional(v.string()),
      projectPath: v.optional(v.string()),
      projectName: v.optional(v.string()),
      model: v.optional(v.string()),
      totalTokens: v.number(),
      cost: v.number(),
      isPublic: v.boolean(),
      messageCount: v.number(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
  ),
  handler: async (ctx, { query: searchQuery, limit = 10 }): Promise<SessionSearchResult[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    // Get user
    const user: UserResult = await ctx.runQuery(internal.search.getUserByWorkosId, {
      workosId: identity.subject,
    });
    if (!user) return [];

    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(searchQuery);

    // Vector search
    const results: { _id: Id<"sessionEmbeddings">; _score: number }[] = await ctx.vectorSearch("sessionEmbeddings", "by_embedding", {
      vector: queryEmbedding,
      limit: limit * 2,
      filter: (q: any) => q.eq("userId", user._id),
    });

    // Load sessions
    const sessions: SessionSearchResult[] = await ctx.runQuery(internal.search.loadSessionsFromEmbeddings, {
      embeddingIds: results.map((r: { _id: Id<"sessionEmbeddings">; _score: number }) => r._id),
    });

    return sessions.slice(0, limit);
  },
});

// Hybrid search (full-text + semantic)
export const hybridSearch = action({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
    semanticWeight: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("sessions"),
      externalId: v.string(),
      title: v.optional(v.string()),
      projectPath: v.optional(v.string()),
      projectName: v.optional(v.string()),
      model: v.optional(v.string()),
      totalTokens: v.number(),
      cost: v.number(),
      isPublic: v.boolean(),
      messageCount: v.number(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
  ),
  handler: async (ctx, { query: searchQuery, limit = 20, semanticWeight = 0.5 }) => {
    const [fullTextResults, semanticResults] = await Promise.all([
      ctx.runQuery(api.search.searchSessions, {
        query: searchQuery,
        limit,
      }),
      ctx.runAction(api.search.semanticSearch, {
        query: searchQuery,
        limit,
      }),
    ]);

    // Merge and score
    const sessionScores = new Map<string, { session: any; score: number }>();

    fullTextResults.forEach((session: any, index: number) => {
      const score = (1 - semanticWeight) * (1 - index / fullTextResults.length);
      sessionScores.set(session._id, { session, score });
    });

    semanticResults.forEach((session: any, index: number) => {
      const semanticScore = semanticWeight * (1 - index / semanticResults.length);
      const existing = sessionScores.get(session._id);
      if (existing) {
        existing.score += semanticScore;
      } else {
        sessionScores.set(session._id, { session, score: semanticScore });
      }
    });

    return Array.from(sessionScores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.session);
  },
});

// Internal queries
export const getUserByWorkosId = internalQuery({
  args: { workosId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      _creationTime: v.number(),
      workosId: v.string(),
      email: v.optional(v.string()),
      name: v.optional(v.string()),
      avatarUrl: v.optional(v.string()),
      apiKey: v.optional(v.string()),
      apiKeyCreatedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
  ),
  handler: async (ctx, { workosId }) => {
    return await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosId", workosId))
      .first();
  },
});

export const loadSessionsFromEmbeddings = internalQuery({
  args: { embeddingIds: v.array(v.id("sessionEmbeddings")) },
  returns: v.array(
    v.object({
      _id: v.id("sessions"),
      externalId: v.string(),
      title: v.optional(v.string()),
      projectPath: v.optional(v.string()),
      projectName: v.optional(v.string()),
      model: v.optional(v.string()),
      totalTokens: v.number(),
      cost: v.number(),
      isPublic: v.boolean(),
      messageCount: v.number(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
  ),
  handler: async (ctx, { embeddingIds }) => {
    const sessions = [];

    for (const embId of embeddingIds) {
      const emb = await ctx.db.get(embId);
      if (!emb) continue;

      const session = await ctx.db.get(emb.sessionId);
      if (session) {
        sessions.push({
          _id: session._id,
          externalId: session.externalId,
          title: session.title,
          projectPath: session.projectPath,
          projectName: session.projectName,
          model: session.model,
          totalTokens: session.totalTokens,
          cost: session.cost,
          isPublic: session.isPublic,
          messageCount: session.messageCount,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        });
      }
    }

    return sessions;
  },
});

// Helper: generate embedding via OpenAI
async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text.slice(0, 8000),
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${await response.text()}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}
