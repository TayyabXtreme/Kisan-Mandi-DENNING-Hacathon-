import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { apiError } from "./lib/errors";
import { cropTitle } from "./lib/kisan";
import { allMarkets, marketView } from "./prices";

/** Open market requests one farmer or buyer may have at a time. */
const MAX_PENDING_PER_USER = 3;

export const list = internalQuery({
  args: {},
  handler: async (ctx) => (await allMarkets(ctx)).map(marketView),
});

/** The market with this name in the district, if one exists. */
async function findMarket(ctx: MutationCtx, name: string, district: string) {
  const sameDistrict = await ctx.db
    .query("markets")
    .withIndex("by_district", (q) => q.eq("district", district))
    .take(100);
  return sameDistrict.find((m) => m.name.toLowerCase() === name.toLowerCase()) ?? null;
}

/** Inserts a market unless one with that name is already in the district. */
async function insertMarket(
  ctx: MutationCtx,
  args: { userId: Id<"users">; name: string; nameUr: string; district: string },
): Promise<{ id: Id<"markets">; created: boolean }> {
  // Same title casing as crops: "hala  mandi" → "Hala Mandi".
  const name = cropTitle(args.name);
  const existing = await findMarket(ctx, name, args.district);
  if (existing) return { id: existing._id, created: false };
  const id = await ctx.db.insert("markets", {
    name,
    nameUr: args.nameUr.trim(),
    nameSd: "",
    district: args.district,
    createdBy: args.userId,
  });
  return { id, created: true };
}

/** Admin: adds a market straight to the list (the REST route checks admin). */
export const create = internalMutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    nameUr: v.optional(v.string()),
    district: v.string(),
  },
  handler: async (ctx, args) => insertMarket(ctx, { ...args, nameUr: args.nameUr ?? "" }),
});

/** Admin: renames a market or moves it to another district. */
export const update = internalMutation({
  args: {
    marketId: v.id("markets"),
    name: v.string(),
    nameUr: v.optional(v.string()),
    district: v.string(),
  },
  handler: async (ctx, args) => {
    const market = await ctx.db.get("markets", args.marketId);
    if (!market) apiError("NOT_FOUND", 404, "Market not found.");
    const name = cropTitle(args.name);
    const clash = await findMarket(ctx, name, args.district);
    if (clash && clash._id !== market._id)
      apiError("MARKET_EXISTS", 409, `${name} is already listed in ${args.district}.`);
    await ctx.db.patch("markets", market._id, {
      name,
      nameUr: args.nameUr?.trim() ?? "",
      district: args.district,
    });
    return marketView({ ...market, name, nameUr: args.nameUr?.trim() ?? "", district: args.district });
  },
});

/**
 * Farmer or buyer: asks the admin to add a market. If it's already listed,
 * returns that market instead so the app can just select it.
 */
export const request = internalMutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    nameUr: v.optional(v.string()),
    district: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ status: "exists"; marketId: Id<"markets"> } | { status: "pending"; id: Id<"marketRequests"> }> => {
    const name = cropTitle(args.name);
    const existing = await findMarket(ctx, name, args.district);
    if (existing) return { status: "exists", marketId: existing._id };

    const pending = await ctx.db
      .query("marketRequests")
      .withIndex("by_userId_and_status", (q) => q.eq("userId", args.userId).eq("status", "pending"))
      .take(MAX_PENDING_PER_USER);
    const duplicate = pending.find(
      (r) => r.district === args.district && r.name.toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) return { status: "pending", id: duplicate._id };
    if (pending.length >= MAX_PENDING_PER_USER)
      apiError(
        "REQUEST_LIMIT",
        400,
        `You have ${MAX_PENDING_PER_USER} requests waiting. The admin will review them soon.`,
      );

    const id = await ctx.db.insert("marketRequests", {
      userId: args.userId,
      name,
      nameUr: args.nameUr?.trim() ?? "",
      district: args.district,
      note: args.note?.trim() ?? "",
      status: "pending",
    });
    return { status: "pending", id };
  },
});

const requestView = (r: Doc<"marketRequests">, requester: Doc<"users"> | null) => ({
  id: r._id,
  name: r.name,
  nameUr: r.nameUr,
  district: r.district,
  note: r.note,
  status: r.status,
  marketId: r.marketId ?? null,
  createdAt: r._creationTime,
  requester: requester
    ? {
        name: requester.name,
        role: requester.role ?? null,
        phone: requester.phone ?? null,
        district: requester.district ?? null,
      }
    : null,
});

/** Admin: requests waiting for review, oldest first. */
export const pendingRequests = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("marketRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(100);
    return await Promise.all(rows.map(async (r) => requestView(r, await ctx.db.get("users", r.userId))));
  },
});

/** The caller's own open requests (shown in the market picker). */
export const myPendingRequests = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("marketRequests")
      .withIndex("by_userId_and_status", (q) => q.eq("userId", args.userId).eq("status", "pending"))
      .take(MAX_PENDING_PER_USER);
    return rows.map((r) => requestView(r, null));
  },
});

/** Admin: approve (creates the market) or reject a pending request. */
export const resolveRequest = internalMutation({
  args: {
    requestId: v.id("marketRequests"),
    approve: v.boolean(),
  },
  handler: async (ctx, args): Promise<{ status: "approved" | "rejected"; marketId: Id<"markets"> | null }> => {
    const req = await ctx.db.get("marketRequests", args.requestId);
    if (!req) apiError("NOT_FOUND", 404, "Request not found.");
    if (req.status !== "pending") apiError("ALREADY_RESOLVED", 409, "This request was already reviewed.");
    if (!args.approve) {
      await ctx.db.patch("marketRequests", req._id, { status: "rejected" });
      return { status: "rejected", marketId: null };
    }
    const market = await insertMarket(ctx, {
      userId: req.userId,
      name: req.name,
      nameUr: req.nameUr,
      district: req.district,
    });
    await ctx.db.patch("marketRequests", req._id, { status: "approved", marketId: market.id });
    return { status: "approved", marketId: market.id };
  },
});
