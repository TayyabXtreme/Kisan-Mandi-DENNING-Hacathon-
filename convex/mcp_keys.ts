import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

/** lastUsedAt is refreshed at most this often (avoids a write per tool call). */
const TOUCH_EVERY_MS = 60_000;

/** The user's link status for the app (never the secret itself). */
export const status = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const key = await ctx.db
      .query("mcpKeys")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();
    return key
      ? { prefix: key.prefix, createdAt: key._creationTime, lastUsedAt: key.lastUsedAt ?? null }
      : null;
  },
});

/** Stores a new key for the user, replacing (and so revoking) any old one. */
export const replace = internalMutation({
  args: { userId: v.id("users"), hash: v.string(), prefix: v.string() },
  handler: async (ctx, args) => {
    const old = await ctx.db
      .query("mcpKeys")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .take(10);
    for (const key of old) await ctx.db.delete("mcpKeys", key._id);
    await ctx.db.insert("mcpKeys", { userId: args.userId, hash: args.hash, prefix: args.prefix });
    return null;
  },
});

/** Deletes the user's key: any connected AI app loses access at once. */
export const revoke = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const keys = await ctx.db
      .query("mcpKeys")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .take(10);
    for (const key of keys) await ctx.db.delete("mcpKeys", key._id);
    return null;
  },
});

/** The key with this hash, if any (the MCP endpoint's sign-in). */
export const byHash = internalQuery({
  args: { hash: v.string() },
  handler: async (ctx, args) => {
    const key = await ctx.db
      .query("mcpKeys")
      .withIndex("by_hash", (q) => q.eq("hash", args.hash))
      .unique();
    return key ? { id: key._id, userId: key.userId, lastUsedAt: key.lastUsedAt ?? null } : null;
  },
});

/** Records that the key was used (shown in the app as "Last used"). */
export const touch = internalMutation({
  args: { keyId: v.id("mcpKeys"), now: v.number() },
  handler: async (ctx, args) => {
    const key = await ctx.db.get("mcpKeys", args.keyId);
    if (key && (!key.lastUsedAt || args.now - key.lastUsedAt > TOUCH_EVERY_MS))
      await ctx.db.patch("mcpKeys", key._id, { lastUsedAt: args.now });
    return null;
  },
});
