import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// Hash text for change detection
function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

// Generate embedding via OpenAI
async function embed(text: string): Promise<number[]> {
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
    throw new Error(`OpenAI error: ${await response.text()}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// Generate embedding for a session
export const generateForSession = internalAction({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, { sessionId }) => {
    const data = await ctx.runMutation(internal.sessions.getForEmbedding, {
      sessionId,
    });

    if (!data || !data.textContent) return null;

    const textHash = hashText(data.textContent);

    // Check if already up to date
    const existing = await ctx.runQuery(internal.embeddings.getBySessionAndHash, {
      sessionId,
      textHash,
    });

    if (existing) return null;

    // Generate embedding
    const embedding = await embed(data.textContent);

    // Store
    await ctx.runMutation(internal.embeddings.store, {
      sessionId,
      userId: data.session.userId,
      embedding,
      textHash,
    });

    return null;
  },
});

// Store embedding
export const store = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    userId: v.id("users"),
    embedding: v.array(v.float64()),
    textHash: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Delete old embedding
    const existing = await ctx.db
      .query("sessionEmbeddings")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }

    // Insert new
    await ctx.db.insert("sessionEmbeddings", {
      sessionId: args.sessionId,
      userId: args.userId,
      embedding: args.embedding,
      textHash: args.textHash,
      createdAt: Date.now(),
    });

    return null;
  },
});

// Check if embedding is current
export const getBySessionAndHash = internalQuery({
  args: {
    sessionId: v.id("sessions"),
    textHash: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("sessionEmbeddings"),
      _creationTime: v.number(),
      sessionId: v.id("sessions"),
      userId: v.id("users"),
      embedding: v.array(v.float64()),
      textHash: v.string(),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx, { sessionId, textHash }) => {
    const existing = await ctx.db
      .query("sessionEmbeddings")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .first();

    if (existing && existing.textHash === textHash) {
      return existing;
    }

    return null;
  },
});

// Batch generate for user
export const batchGenerateForUser = internalAction({
  args: { userId: v.id("users") },
  returns: v.number(),
  handler: async (ctx, { userId }): Promise<number> => {
    const sessions: Id<"sessions">[] = await ctx.runQuery(internal.embeddings.getSessionsNeedingEmbeddings, {
      userId,
    });

    for (const sessionId of sessions) {
      try {
        await ctx.runAction(internal.embeddings.generateForSession, { sessionId });
      } catch (e) {
        console.error(`Failed to embed session ${sessionId}:`, e);
      }
    }

    return sessions.length;
  },
});

// Get sessions without embeddings
export const getSessionsNeedingEmbeddings = internalQuery({
  args: { userId: v.id("users") },
  returns: v.array(v.id("sessions")),
  handler: async (ctx, { userId }) => {
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const needsEmbedding = [];

    for (const session of sessions) {
      const embedding = await ctx.db
        .query("sessionEmbeddings")
        .withIndex("by_session", (q) => q.eq("sessionId", session._id))
        .first();

      if (!embedding) {
        needsEmbedding.push(session._id);
      }
    }

    return needsEmbedding;
  },
});
