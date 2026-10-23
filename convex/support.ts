import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { apiError } from "./lib/errors";

/** Open messages one farmer or buyer may have waiting at a time. */
const MAX_OPEN_PER_USER = 5;

const topicValidator = v.union(
  v.literal("market"),
  v.literal("price"),
  v.literal("account"),
  v.literal("other"),
);

const messageView = (m: Doc<"supportMessages">, sender: Doc<"users"> | null) => ({
  id: m._id,
  topic: m.topic,
  message: m.message,
  status: m.status,
  createdAt: m._creationTime,
  sender: sender
    ? {
        name: sender.name,
        role: sender.role ?? null,
        phone: sender.phone ?? null,
        district: sender.district ?? null,
        email: sender.contactEmail ?? sender.email ?? null,
      }
    : null,
});

/** Farmer or buyer: sends the admin a message. */
export const create = internalMutation({
  args: { userId: v.id("users"), topic: topicValidator, message: v.string() },
  handler: async (ctx, args) => {
    const open = await ctx.db
      .query("supportMessages")
      .withIndex("by_userId_and_status", (q) => q.eq("userId", args.userId).eq("status", "open"))
      .take(MAX_OPEN_PER_USER);
    if (open.length >= MAX_OPEN_PER_USER)
      apiError(
        "MESSAGE_LIMIT",
        400,
        `You have ${MAX_OPEN_PER_USER} messages waiting. The admin will reply soon.`,
      );
    const id = await ctx.db.insert("supportMessages", {
      userId: args.userId,
      topic: args.topic,
      message: args.message.trim(),
      status: "open",
    });
    return { id };
  },
});

/** Admin: open messages, oldest first, with who sent them. */
export const openMessages = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("supportMessages")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .take(100);
    return await Promise.all(rows.map(async (m) => messageView(m, await ctx.db.get("users", m.userId))));
  },
});

/** The caller's own open messages. */
export const myOpenMessages = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("supportMessages")
      .withIndex("by_userId_and_status", (q) => q.eq("userId", args.userId).eq("status", "open"))
      .take(MAX_OPEN_PER_USER);
    return rows.map((m) => messageView(m, null));
  },
});

/** Admin: marks a message handled. */
export const resolve = internalMutation({
  args: { messageId: v.id("supportMessages") },
  handler: async (ctx, args) => {
    const message = await ctx.db.get("supportMessages", args.messageId);
    if (!message) apiError("NOT_FOUND", 404, "Message not found.");
    if (message.status !== "done") await ctx.db.patch("supportMessages", message._id, { status: "done" });
    return { status: "done" as const };
  },
});
