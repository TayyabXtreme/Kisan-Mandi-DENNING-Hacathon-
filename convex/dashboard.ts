// Dashboard (GET /api/v1/dashboard). Farmers: stock, budget (expenses vs
// sales), per-crop costs, buyer offers waiting for an answer and recent deals.
// Buyers: their open offers and purchases.
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, type QueryCtx } from "./_generated/server";
import { EXPENSE_LIMIT } from "./expenses";
import { round2 } from "./lib/kisan";
import { cropView } from "./prices";

const LISTING_LIMIT = 200;
const CHAT_LIMIT = 100;
const SALES_LIMIT = 1000;
const RECENT = 10;
/** Months shown in the budget chart, ending with the current one. */
const CHART_MONTHS = 6;

type Crop = ReturnType<typeof cropView>;

/** Looks up each crop once per request. */
function cropCache(ctx: QueryCtx) {
  const cache = new Map<Id<"crops">, Crop | null>();
  return async (id: Id<"crops">) => {
    if (!cache.has(id)) {
      const crop = await ctx.db.get("crops", id);
      cache.set(id, crop ? cropView(crop) : null);
    }
    return cache.get(id) ?? null;
  };
}

/** "2026-10-23" → the last CHART_MONTHS month keys, oldest first ("2026-05" … "2026-10"). */
function monthKeys(date: string) {
  let y = Number(date.slice(0, 4));
  let m = Number(date.slice(5, 7));
  const keys: string[] = [];
  for (let i = 0; i < CHART_MONTHS; i++) {
    keys.unshift(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return keys;
}

const personView = (user: Doc<"users"> | null) =>
  user
    ? { id: user._id, name: user.name, district: user.district ?? null, authId: user.authId, image: user.image ?? null }
    : null;

/** Offers waiting for an answer in my chats (one per chat at most). */
async function openOffers(
  ctx: QueryCtx,
  userId: Id<"users">,
  convs: Doc<"conversations">[],
  crop: ReturnType<typeof cropCache>,
) {
  const out = [];
  for (const conv of convs) {
    if (!conv.pendingOfferId) continue;
    const m = await ctx.db.get("messages", conv.pendingOfferId);
    if (!m?.offer || m.offer.status !== "pending") continue;
    const listing = await ctx.db.get("listings", conv.listingId);
    if (!listing || listing.status !== "active") continue;
    const c = await crop(listing.cropId);
    if (!c) continue;
    const otherId = conv.farmerId === userId ? conv.buyerId : conv.farmerId;
    out.push({
      id: m._id,
      conversationId: conv._id,
      listing: { id: listing._id, crop: c, grade: listing.grade, askingPrice: listing.askingPrice, stock: listing.quantity },
      other: personView(await ctx.db.get("users", otherId)),
      price: m.offer.price,
      quantity: m.offer.quantity,
      total: Math.round(m.offer.price * m.offer.quantity),
      note: m.body || null,
      createdAt: m.createdAt,
      /** True when I have to answer it (the other side sent it). */
      awaitingMe: m.senderId !== userId,
    });
  }
  // Ones I must answer first, newest first.
  return out.sort((a, b) => Number(b.awaitingMe) - Number(a.awaitingMe) || b.createdAt - a.createdAt);
}

async function saleViews(
  ctx: QueryCtx,
  rows: Doc<"sales">[],
  side: "farmer" | "buyer",
  crop: ReturnType<typeof cropCache>,
) {
  const out = [];
  for (const s of rows.slice(0, RECENT)) {
    const c = await crop(s.cropId);
    if (!c) continue;
    const other = await ctx.db.get("users", side === "farmer" ? s.buyerId : s.farmerId);
    out.push({
      id: s._id,
      crop: c,
      quantity: s.quantity,
      price: s.price,
      total: s.total,
      date: s.date,
      other: other ? { name: other.name } : null,
      conversationId: s.conversationId,
    });
  }
  return out;
}

export const farmer = internalQuery({
  args: { userId: v.id("users"), date: v.string() },
  handler: async (ctx, args) => {
    const crop = cropCache(ctx);
    const [listings, expenses, sales, convs] = await Promise.all([
      ctx.db
        .query("listings")
        .withIndex("by_user_and_status", (q) => q.eq("userId", args.userId).eq("status", "active"))
        .take(LISTING_LIMIT),
      ctx.db
        .query("expenses")
        .withIndex("by_userId_and_date", (q) => q.eq("userId", args.userId))
        .order("desc")
        .take(EXPENSE_LIMIT),
      ctx.db
        .query("sales")
        .withIndex("by_farmerId_and_date", (q) => q.eq("farmerId", args.userId))
        .order("desc")
        .take(SALES_LIMIT),
      ctx.db
        .query("conversations")
        .withIndex("by_farmer_and_lastMessageAt", (q) => q.eq("farmerId", args.userId))
        .order("desc")
        .take(CHAT_LIMIT),
    ]);

    // Stock: active listings grouped by crop.
    const stockByCrop = new Map<Id<"crops">, { quantity: number; value: number; listings: number }>();
    for (const l of listings) {
      const s = stockByCrop.get(l.cropId) ?? { quantity: 0, value: 0, listings: 0 };
      s.quantity = round2(s.quantity + l.quantity);
      s.value += l.quantity * l.askingPrice;
      s.listings += 1;
      stockByCrop.set(l.cropId, s);
    }

    // Budget per crop and per category, plus the monthly chart.
    const months = monthKeys(args.date).map((key) => ({ key, spent: 0, earned: 0 }));
    const monthOf = new Map(months.map((m) => [m.key, m]));
    const perCrop = new Map<Id<"crops">, { spent: number; earned: number; soldQty: number }>();
    const cropRow = (id: Id<"crops">) => {
      let row = perCrop.get(id);
      if (!row) perCrop.set(id, (row = { spent: 0, earned: 0, soldQty: 0 }));
      return row;
    };
    const categories = new Map<Doc<"expenses">["category"], number>();
    let spent = 0;
    for (const e of expenses) {
      spent += e.amount;
      cropRow(e.cropId).spent += e.amount;
      categories.set(e.category, (categories.get(e.category) ?? 0) + e.amount);
      const month = monthOf.get(e.date.slice(0, 7));
      if (month) month.spent += e.amount;
    }
    let earned = 0;
    let soldQty = 0;
    for (const s of sales) {
      earned += s.total;
      soldQty += s.quantity;
      const row = cropRow(s.cropId);
      row.earned += s.total;
      row.soldQty = round2(row.soldQty + s.quantity);
      const month = monthOf.get(s.date.slice(0, 7));
      if (month) month.earned += s.total;
    }
    for (const id of stockByCrop.keys()) cropRow(id);

    const stock = [];
    for (const [id, s] of stockByCrop) {
      const c = await crop(id);
      if (c) stock.push({ crop: c, quantity: s.quantity, value: Math.round(s.value), listings: s.listings });
    }
    stock.sort((a, b) => b.value - a.value);

    const crops = [];
    for (const [id, row] of perCrop) {
      const c = await crop(id);
      if (!c) continue;
      const inStock = stockByCrop.get(id);
      crops.push({
        crop: c,
        spent: row.spent,
        earned: row.earned,
        profit: row.earned - row.spent,
        soldQty: row.soldQty,
        stockQty: inStock?.quantity ?? 0,
        stockValue: Math.round(inStock?.value ?? 0),
      });
    }
    crops.sort((a, b) => b.spent + b.earned - (a.spent + a.earned));

    const stockQty = round2(stock.reduce((sum, s) => sum + s.quantity, 0));
    const stockValue = stock.reduce((sum, s) => sum + s.value, 0);
    return {
      role: "farmer" as const,
      totals: { stockQty, stockValue, spent, earned, profit: earned - spent, soldQty: round2(soldQty), deals: sales.length },
      stock,
      crops,
      categories: [...categories.entries()]
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount),
      months: months.map((m) => ({ month: m.key, spent: m.spent, earned: m.earned })),
      offers: await openOffers(ctx, args.userId, convs, crop),
      sales: await saleViews(ctx, sales, "farmer", crop),
    };
  },
});

export const buyer = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const crop = cropCache(ctx);
    const [purchases, convs] = await Promise.all([
      ctx.db
        .query("sales")
        .withIndex("by_buyerId_and_date", (q) => q.eq("buyerId", args.userId))
        .order("desc")
        .take(SALES_LIMIT),
      ctx.db
        .query("conversations")
        .withIndex("by_buyer_and_lastMessageAt", (q) => q.eq("buyerId", args.userId))
        .order("desc")
        .take(CHAT_LIMIT),
    ]);
    const offers = await openOffers(ctx, args.userId, convs, crop);
    return {
      role: "buyer" as const,
      totals: {
        spent: purchases.reduce((sum, s) => sum + s.total, 0),
        boughtQty: round2(purchases.reduce((sum, s) => sum + s.quantity, 0)),
        deals: purchases.length,
        openOffers: offers.length,
      },
      offers,
      purchases: await saleViews(ctx, purchases, "buyer", crop),
    };
  },
});
