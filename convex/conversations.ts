// Buyer <-> farmer chat: conversations (docs/plan.md §7).
// Reads are public reactive queries (the chat screens use useQuery so new
// messages appear instantly — a documented exception to the REST-only rule).
// Writes are internal mutations called from convex/rest/chat_routes.ts.
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { apiError } from "./lib/errors";
import { marketLabel } from "./lib/kisan";
import { cropView, marketAverage } from "./prices";
import { requireUser } from "./users";

/** How many conversations a list reads per side (buyer / farmer). */
const LIST_LIMIT = 100;

export type Side = "buyer" | "farmer";

/** The caller's side in a conversation, or null when not a participant. */
export function sideOf(conv: Doc<"conversations">, userId: Id<"users">): Side | null {
  if (conv.buyerId === userId) return "buyer";
  if (conv.farmerId === userId) return "farmer";
  return null;
}

export const otherId = (conv: Doc<"conversations">, side: Side) =>
  side === "buyer" ? conv.farmerId : conv.buyerId;

/** Loads a conversation the caller takes part in (404 / 403 otherwise). */
export async function participantConversation(
  ctx: QueryCtx,
  userId: Id<"users">,
  conversationId: Id<"conversations">,
) {
  const conv = await ctx.db.get("conversations", conversationId);
  if (!conv) apiError("NOT_FOUND", 404, "Chat not found.");
  const side = sideOf(conv, userId);
  if (!side) apiError("FORBIDDEN", 403, "You are not part of this chat.");
  return { conv, side };
}

/** True when either user has blocked the other. */
export async function blockedBetween(ctx: QueryCtx, a: Id<"users">, b: Id<"users">) {
  const [ab, ba] = await Promise.all([
    ctx.db
      .query("blocks")
      .withIndex("by_user_and_blockedUserId", (q) => q.eq("userId", a).eq("blockedUserId", b))
      .first(),
    ctx.db
      .query("blocks")
      .withIndex("by_user_and_blockedUserId", (q) => q.eq("userId", b).eq("blockedUserId", a))
      .first(),
  ]);
  return { iBlocked: !!ab, blockedMe: !!ba };
}

/** Short preview shown in the Chats list. */
export function previewOf(
  type: Doc<"messages">["type"],
  body: string,
  offer?: { price: number; quantity: number },
) {
  if (type === "voice") return "🎤 Voice note";
  if (type === "image") return body ? `📷 ${body}` : "📷 Photo";
  if (type === "offer" && offer)
    return `💰 Offer: Rs ${Math.round(offer.price).toLocaleString("en-US")} × ${offer.quantity} maund`;
  return body.length > 120 ? `${body.slice(0, 117)}…` : body;
}

/** Inserts a message and updates preview, unread counters and archive flags. */
export async function insertMessage(
  ctx: MutationCtx,
  conv: Doc<"conversations">,
  message: Omit<Doc<"messages">, "_id" | "_creationTime" | "conversationId" | "createdAt">,
  /** For system messages: who caused it (e.g. the farmer accepting), so the other side gets an unread. */
  actorId?: Id<"users">,
) {
  const now = Date.now();
  const id = await ctx.db.insert("messages", { ...message, conversationId: conv._id, createdAt: now });
  const by = message.senderId ?? actorId;
  const from = by ? sideOf(conv, by) : null;
  await ctx.db.patch("conversations", conv._id, {
    lastMessage: previewOf(message.type, message.body, message.offer),
    lastMessageType: message.type,
    lastSenderId: message.senderId,
    lastMessageAt: now,
    // The sender has obviously seen the chat; the other side gets +1.
    buyerUnread: from === "buyer" ? 0 : conv.buyerUnread + (from ? 1 : 0),
    farmerUnread: from === "farmer" ? 0 : conv.farmerUnread + (from ? 1 : 0),
    ...(from === "buyer" ? { buyerLastReadAt: now } : {}),
    ...(from === "farmer" ? { farmerLastReadAt: now } : {}),
    // A new message brings an archived chat back for the person it reaches.
    ...(from === "buyer" ? { farmerArchived: false } : {}),
    ...(from === "farmer" ? { buyerArchived: false } : {}),
  });
  return id;
}

async function listingSummary(ctx: QueryCtx, listingId: Id<"listings">, date: string | null) {
  const listing = await ctx.db.get("listings", listingId);
  if (!listing) return null;
  const crop = await ctx.db.get("crops", listing.cropId);
  if (!crop) return null;
  const avg = date ? await marketAverage(ctx, listing.cropId, date) : null;
  return {
    id: listing._id,
    crop: cropView(crop),
    grade: listing.grade,
    quantity: listing.quantity,
    askingPrice: listing.askingPrice,
    district: listing.district,
    status: listing.status,
    marketLabel: avg ? marketLabel(listing.askingPrice, avg.avg) : null,
  };
}

const personView = (user: Doc<"users"> | null) =>
  user
    ? {
        id: user._id,
        name: user.name,
        role: user.role ?? null,
        district: user.district ?? null,
        authId: user.authId,
        image: user.image ?? null,
        phone: user.phone ?? null,
      }
    : null;

/** My conversations (as buyer and as farmer), newest first. */
async function myConversations(ctx: QueryCtx, userId: Id<"users">) {
  const [asBuyer, asFarmer] = await Promise.all([
    ctx.db
      .query("conversations")
      .withIndex("by_buyer_and_lastMessageAt", (q) => q.eq("buyerId", userId))
      .order("desc")
      .take(LIST_LIMIT),
    ctx.db
      .query("conversations")
      .withIndex("by_farmer_and_lastMessageAt", (q) => q.eq("farmerId", userId))
      .order("desc")
      .take(LIST_LIMIT),
  ]);
  return [...asBuyer, ...asFarmer].sort((a, b) => b.lastMessageAt - a.lastMessageAt);
}

/** Chats tab: rows with the other person, listing, preview and my unread count. */
export const list = query({
  args: { archived: v.boolean() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const rows = [];
    for (const conv of await myConversations(ctx, me._id)) {
      const side = sideOf(conv, me._id)!;
      const archived = side === "buyer" ? conv.buyerArchived : conv.farmerArchived;
      if (archived !== args.archived) continue;
      const other = await ctx.db.get("users", otherId(conv, side));
      const listing = await ctx.db.get("listings", conv.listingId);
      const crop = listing ? await ctx.db.get("crops", listing.cropId) : null;
      rows.push({
        id: conv._id,
        side,
        other: personView(other),
        listing: listing && crop
          ? { id: listing._id, crop: cropView(crop), grade: listing.grade, status: listing.status }
          : null,
        lastMessage: conv.lastMessage,
        lastMessageType: conv.lastMessageType,
        lastFromMe: conv.lastSenderId === me._id,
        lastMessageAt: conv.lastMessageAt,
        // Read when the other side opened the chat after the last message.
        lastRead:
          (side === "buyer" ? conv.farmerLastReadAt : conv.buyerLastReadAt) >= conv.lastMessageAt,
        unread: side === "buyer" ? conv.buyerUnread : conv.farmerUnread,
      });
    }
    return rows;
  },
});

/** Total unread messages, for the Chats tab badge. */
export const unreadTotal = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    let total = 0;
    for (const conv of await myConversations(ctx, me._id)) {
      const side = sideOf(conv, me._id)!;
      total += side === "buyer" ? conv.buyerUnread : conv.farmerUnread;
    }
    return total;
  },
});

/**
 * Chat screen header + pinned listing. Null when the chat doesn't exist or
 * the caller isn't part of it. `date` is today's PK date (queries can't read
 * the clock) for the listing's market label.
 */
export const get = query({
  args: { conversationId: v.string(), date: v.string() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const id = ctx.db.normalizeId("conversations", args.conversationId);
    const conv = id ? await ctx.db.get("conversations", id) : null;
    if (!conv) return null;
    const side = sideOf(conv, me._id);
    if (!side) return null;
    const other = await ctx.db.get("users", otherId(conv, side));
    const blocks = await blockedBetween(ctx, me._id, otherId(conv, side));
    return {
      id: conv._id,
      side,
      me: { id: me._id },
      other: personView(other),
      listing: await listingSummary(ctx, conv.listingId, args.date),
      myUnread: side === "buyer" ? conv.buyerUnread : conv.farmerUnread,
      otherLastReadAt: side === "buyer" ? conv.farmerLastReadAt : conv.buyerLastReadAt,
      archived: side === "buyer" ? conv.buyerArchived : conv.farmerArchived,
      status: conv.status,
      ...blocks,
    };
  },
});

// ---------- internal (REST) ----------

/** Finds or creates the caller's chat about a listing (one per buyer per listing). */
export const findOrCreate = internalMutation({
  args: { userId: v.id("users"), listingId: v.id("listings") },
  handler: async (ctx, args): Promise<{ id: Id<"conversations">; created: boolean }> => {
    const listing = await ctx.db.get("listings", args.listingId);
    if (!listing) apiError("NOT_FOUND", 404, "Listing not found.");
    if (listing.userId === args.userId)
      apiError("OWN_LISTING", 400, "You can't start a chat about your own listing.");
    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_listing_and_buyer", (q) =>
        q.eq("listingId", args.listingId).eq("buyerId", args.userId),
      )
      .unique();
    if (existing) {
      if (existing.buyerArchived)
        await ctx.db.patch("conversations", existing._id, { buyerArchived: false });
      return { id: existing._id, created: false };
    }
    if (listing.status !== "active")
      apiError("LISTING_SOLD", 400, "This listing is no longer available.");
    const { iBlocked, blockedMe } = await blockedBetween(ctx, args.userId, listing.userId);
    if (blockedMe) apiError("BLOCKED", 403, "You can't message this person.");
    if (iBlocked) apiError("BLOCKED", 403, "You blocked this person. Unblock them to chat.");
    const crop = await ctx.db.get("crops", listing.cropId);
    const now = Date.now();
    const id = await ctx.db.insert("conversations", {
      listingId: listing._id,
      buyerId: args.userId,
      farmerId: listing.userId,
      lastMessage: "",
      lastMessageType: "system",
      lastMessageAt: now,
      buyerUnread: 0,
      farmerUnread: 0,
      buyerLastReadAt: now,
      farmerLastReadAt: 0,
      buyerArchived: false,
      farmerArchived: false,
      status: "open",
    });
    const conv = (await ctx.db.get("conversations", id))!;
    await insertMessage(ctx, conv, {
      type: "system",
      body: `Chat started about ${crop?.name ?? "a listing"} · Grade ${listing.grade}. Phone numbers stay private.`,
    });
    return { id, created: true };
  },
});

/** Opens the chat: my unread → 0, other side's messages get readAt (✓✓ green). */
export const markRead = internalMutation({
  args: { userId: v.id("users"), conversationId: v.id("conversations") },
  handler: async (ctx, args): Promise<null> => {
    const { conv, side } = await participantConversation(ctx, args.userId, args.conversationId);
    const now = Date.now();
    const unread = side === "buyer" ? conv.buyerUnread : conv.farmerUnread;
    await ctx.db.patch("conversations", conv._id, {
      ...(side === "buyer"
        ? { buyerUnread: 0, buyerLastReadAt: now }
        : { farmerUnread: 0, farmerLastReadAt: now }),
    });
    if (unread > 0) {
      const recent = await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) => q.eq("conversationId", conv._id))
        .order("desc")
        .take(Math.min(unread + 5, 200));
      for (const m of recent)
        if (!m.readAt && m.senderId && m.senderId !== args.userId)
          await ctx.db.patch("messages", m._id, { readAt: now });
    }
    return null;
  },
});

export const setArchived = internalMutation({
  args: { userId: v.id("users"), conversationId: v.id("conversations"), archived: v.boolean() },
  handler: async (ctx, args): Promise<null> => {
    const { conv, side } = await participantConversation(ctx, args.userId, args.conversationId);
    await ctx.db.patch(
      "conversations",
      conv._id,
      side === "buyer" ? { buyerArchived: args.archived } : { farmerArchived: args.archived },
    );
    return null;
  },
});

/** Blocks (or unblocks) the other person in a chat. */
export const setBlocked = internalMutation({
  args: { userId: v.id("users"), conversationId: v.id("conversations"), blocked: v.boolean() },
  handler: async (ctx, args): Promise<null> => {
    const { conv, side } = await participantConversation(ctx, args.userId, args.conversationId);
    const blockedUserId = otherId(conv, side);
    const existing = await ctx.db
      .query("blocks")
      .withIndex("by_user_and_blockedUserId", (q) =>
        q.eq("userId", args.userId).eq("blockedUserId", blockedUserId),
      )
      .first();
    if (args.blocked && !existing)
      await ctx.db.insert("blocks", { userId: args.userId, blockedUserId });
    if (!args.blocked && existing) await ctx.db.delete("blocks", existing._id);
    return null;
  },
});

export const report = internalMutation({
  args: { userId: v.id("users"), conversationId: v.id("conversations"), reason: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const { conv, side } = await participantConversation(ctx, args.userId, args.conversationId);
    await ctx.db.insert("reports", {
      reporterId: args.userId,
      reportedUserId: otherId(conv, side),
      conversationId: conv._id,
      reason: args.reason,
    });
    return null;
  },
});

/** Chats per listing for the farmer's My Listings chips. */
export const countsByListing = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<Record<string, number>> => {
    const rows = await ctx.db
      .query("conversations")
      .withIndex("by_farmer_and_lastMessageAt", (q) => q.eq("farmerId", args.userId))
      .order("desc")
      .take(500);
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.listingId] = (counts[row.listingId] ?? 0) + 1;
    return counts;
  },
});
