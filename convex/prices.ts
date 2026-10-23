import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type QueryCtx,
} from "./_generated/server";
import { apiError } from "./lib/errors";
import {
  addDays,
  HISTORY_DAYS,
  priceChange,
  round1,
  todayPK,
} from "./lib/kisan";

/** The most recent `count` prices on or before `date`, newest first. */
export async function recentPrices(
  ctx: QueryCtx,
  cropId: Id<"crops">,
  marketId: Id<"markets">,
  date: string,
  count = 1,
) {
  return await ctx.db
    .query("prices")
    .withIndex("by_crop_and_market_and_date", (q) =>
      q.eq("cropId", cropId).eq("marketId", marketId).lte("date", date),
    )
    .order("desc")
    .take(count);
}

export async function latestPrice(
  ctx: QueryCtx,
  cropId: Id<"crops">,
  marketId: Id<"markets">,
  date: string,
) {
  const [row] = await recentPrices(ctx, cropId, marketId, date, 1);
  return row ?? null;
}

export async function allMarkets(ctx: QueryCtx) {
  // Seeded mandis plus ones farmers and buyers add (up to 5 each).
  return await ctx.db.query("markets").take(200);
}

export async function allCrops(ctx: QueryCtx) {
  return await ctx.db.query("crops").take(300);
}

/** Latest price of a crop in every market, best first. */
export async function compareMarkets(
  ctx: QueryCtx,
  cropId: Id<"crops">,
  date: string,
) {
  const rows = [];
  for (const market of await allMarkets(ctx)) {
    const latest = await latestPrice(ctx, cropId, market._id, date);
    if (latest) rows.push({ market, price: latest.price, date: latest.date });
  }
  return rows.sort((a, b) => b.price - a.price);
}

/** Average of today's latest price across all markets (for listing labels). */
export async function marketAverage(
  ctx: QueryCtx,
  cropId: Id<"crops">,
  date: string,
) {
  const rows = await compareMarkets(ctx, cropId, date);
  if (rows.length === 0) return null;
  return {
    avg: Math.round(rows.reduce((s, r) => s + r.price, 0) / rows.length),
    markets: rows.length,
  };
}

export const cropView = (crop: Doc<"crops">) => ({
  id: crop._id,
  name: crop.name,
  nameUr: crop.nameUr,
  nameSd: crop.nameSd,
  category: crop.category,
  icon: crop.icon,
});

export const marketView = (market: Doc<"markets">) => ({
  id: market._id,
  name: market.name,
  nameUr: market.nameUr,
  nameSd: market.nameSd,
  district: market.district,
});

/** Today's price list for one market, with change vs the previous day. */
export const today = internalQuery({
  args: { marketId: v.id("markets"), date: v.string() },
  handler: async (ctx, args) => {
    const market = await ctx.db.get("markets", args.marketId);
    if (!market) return null;
    let asOf: string | null = null;
    // Most recent admin publish among the shown prices, if any.
    let published: { by: Id<"users">; date: string } | null = null;
    const items = [];
    for (const crop of await allCrops(ctx)) {
      const [latest, previous] = await recentPrices(
        ctx,
        crop._id,
        args.marketId,
        args.date,
        2,
      );
      if (!latest) continue;
      if (!asOf || latest.date > asOf) asOf = latest.date;
      if (latest.publishedBy && (!published || latest.date > published.date))
        published = { by: latest.publishedBy, date: latest.date };
      const change = priceChange(latest.price, previous?.price ?? null);
      items.push({
        crop: cropView(crop),
        price: latest.price,
        previous: previous?.price ?? null,
        date: latest.date,
        change: change.amount,
        changePct: change.pct,
      });
    }
    const publisher = published ? await ctx.db.get("users", published.by) : null;
    return {
      market: marketView(market),
      asOf,
      items,
      publishedBy: published ? { name: publisher?.name || "Admin", date: published.date } : null,
    };
  },
});

/** Daily series for the chart, plus min, max and average. */
export const history = internalQuery({
  args: {
    cropId: v.id("crops"),
    marketId: v.id("markets"),
    date: v.string(),
    days: v.number(),
  },
  handler: async (ctx, args) => {
    const crop = await ctx.db.get("crops", args.cropId);
    const market = await ctx.db.get("markets", args.marketId);
    if (!crop || !market) return null;
    const days = Math.min(Math.max(Math.round(args.days), 2), 60);
    // End on the latest available day, so a late cron still shows 14 points.
    const [latest, previous] = await recentPrices(
      ctx,
      args.cropId,
      args.marketId,
      args.date,
      2,
    );
    if (!latest) return { crop: cropView(crop), market: marketView(market), points: [], stats: null, latest: null };
    const from = addDays(latest.date, -(days - 1));
    const rows = await ctx.db
      .query("prices")
      .withIndex("by_crop_and_market_and_date", (q) =>
        q
          .eq("cropId", args.cropId)
          .eq("marketId", args.marketId)
          .gte("date", from)
          .lte("date", latest.date),
      )
      .take(days);
    const points = rows.map((r) => ({ date: r.date, price: r.price }));
    let min = points[0];
    let max = points[0];
    for (const p of points) {
      if (p.price < min.price) min = p;
      if (p.price > max.price) max = p;
    }
    const avg = round1(points.reduce((s, p) => s + p.price, 0) / points.length);
    const change = priceChange(latest.price, previous?.price ?? null);
    return {
      crop: cropView(crop),
      market: marketView(market),
      points,
      stats: { min, max, avg: Math.round(avg), days: points.length },
      latest: {
        price: latest.price,
        date: latest.date,
        change: change.amount,
        changePct: change.pct,
      },
    };
  },
});

/** Every market's latest price for a crop, best first, relative to `marketId`. */
export const compare = internalQuery({
  args: {
    cropId: v.id("crops"),
    marketId: v.optional(v.id("markets")),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await compareMarkets(ctx, args.cropId, args.date);
    const selected = rows.find((r) => r.market._id === args.marketId);
    const avg = rows.length
      ? Math.round(rows.reduce((s, r) => s + r.price, 0) / rows.length)
      : null;
    return {
      average: avg,
      markets: rows.map((r, i) => ({
        rank: i + 1,
        market: marketView(r.market),
        price: r.price,
        date: r.date,
        best: i === 0,
        selected: r.market._id === args.marketId,
        diffVsSelected: selected ? r.price - selected.price : null,
      })),
    };
  },
});

/** Compact context for the AI advisor. */
export const adviceContext = internalQuery({
  args: { cropId: v.id("crops"), marketId: v.id("markets"), date: v.string() },
  handler: async (ctx, args) => {
    const crop = await ctx.db.get("crops", args.cropId);
    const market = await ctx.db.get("markets", args.marketId);
    if (!crop || !market) return null;
    const series = await ctx.db
      .query("prices")
      .withIndex("by_crop_and_market_and_date", (q) =>
        q
          .eq("cropId", args.cropId)
          .eq("marketId", args.marketId)
          .gte("date", addDays(args.date, -(HISTORY_DAYS - 1)))
          .lte("date", args.date),
      )
      .take(HISTORY_DAYS);
    const markets = await compareMarkets(ctx, args.cropId, args.date);
    return {
      crop: crop.name,
      market: market.name,
      series: series.map((s) => ({ date: s.date, price: s.price })),
      markets: markets.map((m) => ({ name: m.market.name, price: m.price })),
    };
  },
});

// Small deterministic noise so repeated runs on the same day agree.
function hashNoise(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000; // 0..1
}

/**
 * Adds today's price for every crop–market pair that lacks one (random walk
 * from the latest price) and trims rows older than 30 days. Run by crons.ts.
 */
export const rollDay = internalMutation({
  args: { date: v.optional(v.string()) },
  handler: async (ctx, args): Promise<number> => {
    const date = args.date ?? todayPK(Date.now());
    let added = 0;
    for (const crop of await allCrops(ctx)) {
      for (const market of await allMarkets(ctx)) {
        const latest = await latestPrice(ctx, crop._id, market._id, date);
        // Admin-published prices are real: carry them, never invent a drift.
        if (!latest || latest.date === date || latest.publishedBy) continue;
        const drift = (hashNoise(`${crop._id}${market._id}${date}`) - 0.48) * 0.04;
        const step = crop.category === "cash" || crop.category === "grain" ? 10 : 5;
        const price = Math.max(
          step,
          Math.round((latest.price * (1 + drift)) / step) * step,
        );
        await ctx.db.insert("prices", {
          cropId: crop._id,
          marketId: market._id,
          date,
          price,
        });
        added++;
      }
    }
    const cutoff = addDays(date, -30);
    const old = await ctx.db
      .query("prices")
      .withIndex("by_date", (q) => q.lt("date", cutoff))
      .take(500);
    for (const row of old) await ctx.db.delete("prices", row._id);
    return added;
  },
});

/**
 * Admin: sets one day's price for each listed crop in a market (replacing a
 * price already there for that day). The REST route checks admin.
 */
export const publish = internalMutation({
  args: {
    adminId: v.id("users"),
    marketId: v.id("markets"),
    date: v.string(),
    items: v.array(v.object({ cropId: v.id("crops"), price: v.number() })),
  },
  handler: async (ctx, args): Promise<{ saved: number }> => {
    if (!(await ctx.db.get("markets", args.marketId))) apiError("NOT_FOUND", 404, "Market not found.");
    for (const item of args.items) {
      if (!(await ctx.db.get("crops", item.cropId))) apiError("NOT_FOUND", 404, "Crop not found.");
      const existing = await ctx.db
        .query("prices")
        .withIndex("by_crop_and_market_and_date", (q) =>
          q.eq("cropId", item.cropId).eq("marketId", args.marketId).eq("date", args.date),
        )
        .first();
      const row = { price: item.price, publishedBy: args.adminId };
      if (existing) await ctx.db.patch("prices", existing._id, row);
      else
        await ctx.db.insert("prices", {
          cropId: item.cropId,
          marketId: args.marketId,
          date: args.date,
          ...row,
        });
    }
    return { saved: args.items.length };
  },
});
