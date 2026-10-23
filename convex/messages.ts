// Buyer <-> farmer chat: messages (docs/plan.md §7). The list is a public
// paginated reactive query; sends and offer replies are internal mutations
// called from convex/rest/chat_routes.ts.
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, query, type QueryCtx } from "./_generated/server";
import {
  blockedBetween,
  insertMessage,
  otherId,
  participantConversation,
  sideOf,
} from "./conversations";
import { apiError } from "./lib/errors";
import { requireUser } from "./users";

const MAX_TEXT = 2000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_VOICE_MS = 5 * 60 * 1000;

async function messageView(ctx: QueryCtx, m: Doc<"messages">, meId: Id<"users">) {
  return {
    id: m._id,
    type: m.type,
    body: m.body,
    mine: !!m.senderId && m.senderId === meId,
    createdAt: m.createdAt,
    readAt: m.readAt ?? null,
    url: m.storageId ? await ctx.storage.getUrl(m.storageId) : null,
    durationMs: m.durationMs ?? null,
    offer: m.offer ?? null,
  };
}

/** Newest first, paginated ("load older"). Empty for non-participants. */
export const list = query({
  args: { conversationId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const id = ctx.db.normalizeId("conversations", args.conversationId);
    const conv = id ? await ctx.db.get("conversations", id) : null;
    if (!conv || !sideOf(conv, me._id))
      return { page: [], isDone: true, continueCursor: "" };
    const result = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conv._id))
      .order("desc")
      .paginate(args.paginationOpts);
    const page = [];
    for (const m of result.page) {
      if (m.deletedFor?.includes(me._id)) continue;
      page.push(await messageView(ctx, m, me._id));
    }
    return { ...result, page };
  },
});

async function checkFile(
  ctx: QueryCtx,
  storageId: Id<"_storage"> | undefined,
  kind: "image" | "voice",
) {
  if (!storageId) apiError("FILE_REQUIRED", 400, "Upload the file first.");
  const meta = await ctx.db.system.get("_storage", storageId);
  if (!meta) apiError("FILE_NOT_FOUND", 400, "The upload was not found. Try again.");
  if (meta.size > MAX_FILE_BYTES) apiError("FILE_TOO_LARGE", 400, "Files must be under 10 MB.");
  if (kind === "image" && meta.contentType && !meta.contentType.startsWith("image/"))
    apiError("NOT_AN_IMAGE", 400, "Send a photo.");
  return storageId;
}

/** Sends a text, voice note, photo or price offer. */
export const send = internalMutation({
  args: {
    userId: v.id("users"),
    conversationId: v.id("conversations"),
    type: v.union(v.literal("text"), v.literal("voice"), v.literal("image"), v.literal("offer")),
    body: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    durationMs: v.optional(v.number()),
    offer: v.optional(v.object({ price: v.number(), quantity: v.number() })),
  },
  handler: async (ctx, args): Promise<Id<"messages">> => {
    const { conv, side } = await participantConversation(ctx, args.userId, args.conversationId);
    const { iBlocked, blockedMe } = await blockedBetween(ctx, args.userId, otherId(conv, side));
    if (blockedMe) apiError("BLOCKED", 403, "You can't message this person.");
    if (iBlocked) apiError("BLOCKED", 403, "You blocked this person. Unblock them to send messages.");
    if (conv.status === "closed") apiError("CHAT_CLOSED", 400, "This chat is closed.");
    const body = (args.body ?? "").trim();

    switch (args.type) {
      case "text":
        if (!body) apiError("EMPTY_MESSAGE", 400, "Type a message.");
        if (body.length > MAX_TEXT) apiError("MESSAGE_TOO_LONG", 400, "Messages are limited to 2,000 characters.");
        return await insertMessage(ctx, conv, { senderId: args.userId, type: "text", body });
      case "image":
        return await insertMessage(ctx, conv, {
          senderId: args.userId,
          type: "image",
          body: body.slice(0, 500),
          storageId: await checkFile(ctx, args.storageId, "image"),
        });
      case "voice": {
        const durationMs = Math.round(args.durationMs ?? 0);
        if (durationMs < 300 || durationMs > MAX_VOICE_MS)
          apiError("BAD_DURATION", 400, "Voice notes must be under 5 minutes.");
        return await insertMessage(ctx, conv, {
          senderId: args.userId,
          type: "voice",
          body: "",
          storageId: await checkFile(ctx, args.storageId, "voice"),
          durationMs,
        });
      }
      case "offer": {
        if (side !== "buyer") apiError("BUYERS_ONLY", 403, "Only the buyer can make an offer.");
        const offer = args.offer;
        if (!offer || !(offer.price > 0)) apiError("PRICE_POSITIVE", 400, "Enter a price above 0.");
        if (!(offer.quantity > 0)) apiError("QTY_POSITIVE", 400, "Enter a quantity above 0.");
        const listing = await ctx.db.get("listings", conv.listingId);
        if (!listing || listing.status !== "active")
          apiError("LISTING_SOLD", 400, "This listing is no longer available.");
        if (offer.quantity > listing.quantity)
          apiError("QTY_TOO_HIGH", 400, `The farmer has ${listing.quantity} maund.`);
        return await insertMessage(ctx, conv, {
          senderId: args.userId,
          type: "offer",
          body: body.slice(0, 500),
          offer: { price: Math.round(offer.price), quantity: offer.quantity, status: "pending" },
        });
      }
    }
  },
});

/**
 * Farmer answers a pending offer (accept / decline), optionally marking the
 * listing sold; "markSold" works on an already accepted offer. Each step adds
 * a system message.
 */
export const respondToOffer = internalMutation({
  args: {
    userId: v.id("users"),
    messageId: v.id("messages"),
    action: v.union(v.literal("accept"), v.literal("decline"), v.literal("markSold")),
    markSold: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<null> => {
    const message = await ctx.db.get("messages", args.messageId);
    if (!message || message.type !== "offer" || !message.offer)
      apiError("NOT_FOUND", 404, "Offer not found.");
    const { conv, side } = await participantConversation(ctx, args.userId, message.conversationId);
    if (side !== "farmer") apiError("FARMER_ONLY", 403, "Only the farmer can answer an offer.");
    const offer = message.offer;
    const terms = `Rs ${offer.price.toLocaleString("en-US")} × ${offer.quantity} maund`;

    if (args.action === "markSold") {
      if (offer.status !== "accepted") apiError("OFFER_NOT_ACCEPTED", 400, "Accept the offer first.");
    } else {
      if (offer.status !== "pending") apiError("OFFER_ANSWERED", 400, "This offer was already answered.");
      const status = args.action === "accept" ? "accepted" : "declined";
      await ctx.db.patch("messages", message._id, { offer: { ...offer, status } });
      await insertMessage(ctx, conv, {
        type: "system",
        body: status === "accepted" ? `Offer accepted: ${terms}.` : `Offer declined: ${terms}.`,
      }, args.userId);
    }

    if (args.action === "markSold" || (args.action === "accept" && args.markSold)) {
      // Reuses the listing owner check (403 when the listing isn't theirs).
      await ctx.runMutation(internal.listings.setStatus, {
        userId: args.userId,
        listingId: conv.listingId,
        status: "sold",
      });
      const fresh = (await ctx.db.get("conversations", conv._id))!;
      await insertMessage(ctx, fresh, { type: "system", body: "The farmer marked this listing as sold." }, args.userId);
    }
    return null;
  },
});

/** Hides a message for the caller only. */
export const deleteForMe = internalMutation({
  args: { userId: v.id("users"), messageId: v.id("messages") },
  handler: async (ctx, args): Promise<null> => {
    const message = await ctx.db.get("messages", args.messageId);
    if (!message) apiError("NOT_FOUND", 404, "Message not found.");
    await participantConversation(ctx, args.userId, message.conversationId);
    const deletedFor = message.deletedFor ?? [];
    if (!deletedFor.includes(args.userId))
      await ctx.db.patch("messages", message._id, { deletedFor: [...deletedFor, args.userId] });
    return null;
  },
});
