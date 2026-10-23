import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { createAuth } from "./auth";

/** Per-table cap for one user's rows (test and real accounts stay far below). */
const MAX_ROWS = 1000;

/** Deletes everything one user owns in the app tables (not the login itself). */
export const deleteUserData = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const counts: Record<string, number> = {};
    const bump = (table: string) => (counts[table] = (counts[table] ?? 0) + 1);

    // Chats they're part of (as buyer or farmer), with every message and file.
    const convs = [
      ...(await ctx.db
        .query("conversations")
        .withIndex("by_buyer_and_lastMessageAt", (q) => q.eq("buyerId", userId))
        .take(MAX_ROWS)),
      ...(await ctx.db
        .query("conversations")
        .withIndex("by_farmer_and_lastMessageAt", (q) => q.eq("farmerId", userId))
        .take(MAX_ROWS)),
    ];
    for (const conv of convs) {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) => q.eq("conversationId", conv._id))
        .take(MAX_ROWS);
      for (const m of messages) {
        if (m.storageId) await ctx.storage.delete(m.storageId);
        await ctx.db.delete("messages", m._id);
        bump("messages");
      }
      await ctx.db.delete("conversations", conv._id);
      bump("conversations");
    }

    for (const row of await ctx.db
      .query("listings")
      .withIndex("by_user_and_status", (q) => q.eq("userId", userId))
      .take(MAX_ROWS)) {
      await ctx.db.delete("listings", row._id);
      bump("listings");
    }
    for (const row of await ctx.db
      .query("expenses")
      .withIndex("by_userId_and_date", (q) => q.eq("userId", userId))
      .take(MAX_ROWS)) {
      await ctx.db.delete("expenses", row._id);
      bump("expenses");
    }
    // Deals they made, as seller or buyer.
    for (const row of [
      ...(await ctx.db.query("sales").withIndex("by_farmerId_and_date", (q) => q.eq("farmerId", userId)).take(MAX_ROWS)),
      ...(await ctx.db.query("sales").withIndex("by_buyerId_and_date", (q) => q.eq("buyerId", userId)).take(MAX_ROWS)),
    ]) {
      await ctx.db.delete("sales", row._id);
      bump("sales");
    }
    for (const row of await ctx.db.query("alerts").withIndex("by_user", (q) => q.eq("userId", userId)).take(MAX_ROWS)) {
      await ctx.db.delete("alerts", row._id);
      bump("alerts");
    }
    for (const row of await ctx.db
      .query("marketRequests")
      .withIndex("by_userId_and_status", (q) => q.eq("userId", userId))
      .take(MAX_ROWS)) {
      await ctx.db.delete("marketRequests", row._id);
      bump("marketRequests");
    }
    for (const row of await ctx.db
      .query("supportMessages")
      .withIndex("by_userId_and_status", (q) => q.eq("userId", userId))
      .take(MAX_ROWS)) {
      await ctx.db.delete("supportMessages", row._id);
      bump("supportMessages");
    }
    for (const row of await ctx.db.query("mcpKeys").withIndex("by_userId", (q) => q.eq("userId", userId)).take(MAX_ROWS)) {
      await ctx.db.delete("mcpKeys", row._id);
      bump("mcpKeys");
    }

    // Blocks and reports by or about them (small tables).
    for (const row of await ctx.db.query("blocks").take(MAX_ROWS))
      if (row.userId === userId || row.blockedUserId === userId) {
        await ctx.db.delete("blocks", row._id);
        bump("blocks");
      }
    for (const row of await ctx.db.query("reports").take(MAX_ROWS))
      if (row.reporterId === userId || row.reportedUserId === userId) {
        await ctx.db.delete("reports", row._id);
        bump("reports");
      }

    // Crops and markets they added stay for everyone; just drop the pointer.
    for (const row of await ctx.db.query("crops").withIndex("by_createdBy", (q) => q.eq("createdBy", userId)).take(MAX_ROWS))
      await ctx.db.patch("crops", row._id, { createdBy: undefined });
    for (const row of await ctx.db.query("markets").withIndex("by_createdBy", (q) => q.eq("createdBy", userId)).take(MAX_ROWS))
      await ctx.db.patch("markets", row._id, { createdBy: undefined });

    return counts;
  },
});

export const findByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.trim().toLowerCase()))
      .first();
    return user ? { userId: user._id, authId: user.authId } : null;
  },
});

/**
 * App data → AI assistant threads → the login (sessions, Google/password
 * links, user). Deleting the login fires the auth trigger that removes the
 * app `users` row.
 */
export async function deleteAccountFully(
  ctx: ActionCtx,
  user: { userId: Id<"users">; authId: string },
) {
  const counts: Record<string, number> = await ctx.runMutation(internal.account.deleteUserData, {
    userId: user.userId,
  });
  await ctx.runAction(components.agent.users.deleteAllForUserId, { userId: user.userId });
  const auth = await createAuth(ctx).$context;
  await auth.internalAdapter.deleteUser(user.authId);
  return counts;
}

/**
 * Maintenance: permanently delete an account by its sign-in email.
 *   npx convex run account:deleteByEmail '{"email":"someone@example.com"}'
 */
export const deleteByEmail = internalAction({
  args: { email: v.string() },
  handler: async (ctx, args): Promise<{ deleted: boolean; counts?: Record<string, number> }> => {
    const user = await ctx.runQuery(internal.account.findByEmail, { email: args.email });
    if (!user) return { deleted: false };
    return { deleted: true, counts: await deleteAccountFully(ctx, user) };
  },
});
