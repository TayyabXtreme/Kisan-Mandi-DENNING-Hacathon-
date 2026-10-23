import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { apiError } from "./lib/errors";
import { marketLabel, round1 } from "./lib/kisan";
import { cropView, marketAverage } from "./prices";
import { gradeValidator, listingStatusValidator } from "./schema";

const SEARCH_LIMIT = 200;

type Averages = Map<Id<"crops">, { avg: number; markets: number } | null>;

async function listingView(
  ctx: QueryCtx,
  listing: Doc<"listings">,
  date: string,
  averages: Averages,
  viewerId: Id<"users"> | null,
) {
  const crop = await ctx.db.get("crops", listing.cropId);
  if (!crop) return null;
  const seller = await ctx.db.get("users", listing.userId);
  if (!averages.has(listing.cropId))
    averages.set(listing.cropId, await marketAverage(ctx, listing.cropId, date));
  const market = averages.get(listing.cropId) ?? null;
  const diff = market ? listing.askingPrice - market.avg : null;
  return {
    id: listing._id,
    crop: cropView(crop),
    quantity: listing.quantity,
    askingPrice: listing.askingPrice,
    district: listing.district,
    grade: listing.grade,
    availableFrom: listing.availableFrom,
    contactPhone: listing.contactPhone,
    status: listing.status,
    createdAt: listing._creationTime,
    updatedAt: listing.updatedAt,
    isOwner: viewerId === listing.userId,
    seller: seller
      ? { id: seller._id, name: seller.name, role: seller.role ?? "farmer" }
      : null,
    market: market
      ? {
          average: market.avg,
          markets: market.markets,
          label: marketLabel(listing.askingPrice, market.avg),
          diff: diff ?? 0,
          diffPct: round1(((diff ?? 0) / market.avg) * 100),
        }
      : null,
  };
}

const norm = (s: string) => s.trim().toLowerCase();

/** Active listings with search, filters and sorting. */
export const search = internalQuery({
  args: {
    viewerId: v.id("users"),
    date: v.string(),
    q: v.optional(v.string()),
    cropId: v.optional(v.id("crops")),
    district: v.optional(v.string()),
    grade: v.optional(gradeValidator),
    sort: v.union(v.literal("newest"), v.literal("price_asc")),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("listings")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .order("desc")
      .take(SEARCH_LIMIT);
    const averages: Averages = new Map();
    const q = args.q ? norm(args.q) : "";
    const out = [];
    for (const row of rows) {
      if (args.cropId && row.cropId !== args.cropId) continue;
      if (args.district && row.district !== args.district) continue;
      if (args.grade && row.grade !== args.grade) continue;
      const view = await listingView(ctx, row, args.date, averages, args.viewerId);
      if (!view) continue;
      if (q) {
        const hay = [
          view.crop.name,
          view.crop.nameUr,
          view.crop.nameSd,
          view.district,
          view.seller?.name ?? "",
        ]
          .map(norm)
          .join(" ");
        if (!hay.includes(q)) continue;
      }
      out.push(view);
    }
    if (args.sort === "price_asc")
      out.sort((a, b) => a.askingPrice - b.askingPrice || b.createdAt - a.createdAt);
    return out;
  },
});

export const get = internalQuery({
  args: { viewerId: v.id("users"), listingId: v.id("listings"), date: v.string() },
  handler: async (ctx, args) => {
    const listing = await ctx.db.get("listings", args.listingId);
    if (!listing) return null;
    // Sold listings stay visible only to their owner.
    if (listing.status !== "active" && listing.userId !== args.viewerId)
      return null;
    const view = await listingView(ctx, listing, args.date, new Map(), args.viewerId);
    if (!view) return null;
    const seller = await ctx.db.get("users", listing.userId);
    return {
      ...view,
      seller: seller
        ? {
            id: seller._id,
            name: seller.name,
            role: seller.role ?? "farmer",
            district: seller.district ?? null,
            authId: seller.authId,
            image: seller.image ?? null,
          }
        : null,
    };
  },
});

/** The caller's own listings plus active/sold counts. */
export const mine = internalQuery({
  args: { userId: v.id("users"), status: listingStatusValidator, date: v.string() },
  handler: async (ctx, args) => {
    const averages: Averages = new Map();
    const items = [];
    const counts = { active: 0, sold: 0 };
    for (const status of ["active", "sold"] as const) {
      const rows = await ctx.db
        .query("listings")
        .withIndex("by_user_and_status", (q) =>
          q.eq("userId", args.userId).eq("status", status),
        )
        .order("desc")
        .take(SEARCH_LIMIT);
      counts[status] = rows.length;
      if (status !== args.status) continue;
      for (const row of rows) {
        const view = await listingView(ctx, row, args.date, averages, args.userId);
        if (view) items.push(view);
      }
    }
    return { items, counts };
  },
});

async function ownListing(
  ctx: MutationCtx,
  userId: Id<"users">,
  listingId: Id<"listings">,
) {
  const listing = await ctx.db.get("listings", listingId);
  if (!listing) apiError("NOT_FOUND", 404, "Listing not found.");
  if (listing.userId !== userId)
    apiError("FORBIDDEN", 403, "You can only change your own listings.");
  return listing;
}

const listingFields = {
  cropId: v.id("crops"),
  quantity: v.number(),
  askingPrice: v.number(),
  district: v.string(),
  grade: gradeValidator,
  availableFrom: v.string(),
  contactPhone: v.string(),
};

export const create = internalMutation({
  args: { userId: v.id("users"), ...listingFields },
  handler: async (ctx, args): Promise<Id<"listings">> => {
    if (!(await ctx.db.get("crops", args.cropId)))
      apiError("CROP_NOT_FOUND", 400, "Unknown crop.");
    return await ctx.db.insert("listings", {
      ...args,
      status: "active",
      updatedAt: Date.now(),
    });
  },
});

/** Returns the stored availableFrom, so the REST layer can allow it unchanged. */
export const ownedDate = internalQuery({
  args: { userId: v.id("users"), listingId: v.id("listings") },
  handler: async (ctx, args) => {
    const listing = await ctx.db.get("listings", args.listingId);
    if (!listing) return { exists: false as const };
    return {
      exists: true as const,
      owner: listing.userId === args.userId,
      availableFrom: listing.availableFrom,
    };
  },
});

export const update = internalMutation({
  args: { userId: v.id("users"), listingId: v.id("listings"), ...listingFields },
  handler: async (ctx, { userId, listingId, ...fields }): Promise<null> => {
    const listing = await ownListing(ctx, userId, listingId);
    if (listing.status === "sold")
      apiError("LISTING_SOLD", 400, "Sold listings can't be edited.");
    if (!(await ctx.db.get("crops", fields.cropId)))
      apiError("CROP_NOT_FOUND", 400, "Unknown crop.");
    await ctx.db.patch("listings", listing._id, {
      ...fields,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const setStatus = internalMutation({
  args: {
    userId: v.id("users"),
    listingId: v.id("listings"),
    status: listingStatusValidator,
  },
  handler: async (ctx, args): Promise<null> => {
    const listing = await ownListing(ctx, args.userId, args.listingId);
    await ctx.db.patch("listings", listing._id, {
      status: args.status,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const remove = internalMutation({
  args: { userId: v.id("users"), listingId: v.id("listings") },
  handler: async (ctx, args): Promise<null> => {
    const listing = await ownListing(ctx, args.userId, args.listingId);
    await ctx.db.delete("listings", listing._id);
    return null;
  },
});
