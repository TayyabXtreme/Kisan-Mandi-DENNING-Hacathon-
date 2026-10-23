import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { apiError } from "./lib/errors";
import { evaluateAlert } from "./lib/kisan";
import { cropView, latestPrice, marketView } from "./prices";
import { conditionValidator } from "./schema";

const MAX_ALERTS = 50;

async function evaluatedAlerts(
  ctx: QueryCtx,
  userId: Id<"users">,
  date: string,
) {
  const alerts = await ctx.db
    .query("alerts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .take(MAX_ALERTS);
  const rows = [];
  for (const alert of alerts) {
    const crop = await ctx.db.get("crops", alert.cropId);
    const market = await ctx.db.get("markets", alert.marketId);
    if (!crop || !market) continue;
    const latest = await latestPrice(ctx, alert.cropId, alert.marketId, date);
    const result = evaluateAlert(
      alert.condition,
      alert.targetPrice,
      latest?.price ?? null,
    );
    const triggered = alert.active && result.triggered;
    rows.push({
      doc: alert,
      view: {
        id: alert._id,
        crop: cropView(crop),
        market: marketView(market),
        condition: alert.condition,
        targetPrice: alert.targetPrice,
        active: alert.active,
        latest: latest?.price ?? null,
        latestDate: latest?.date ?? null,
        status: !alert.active
          ? ("paused" as const)
          : triggered
            ? ("triggered" as const)
            : ("waiting" as const),
        toGo: result.toGo,
      },
    });
  }
  return rows;
}

/**
 * Re-evaluates the caller's alerts against the latest prices. Alerts that
 * trigger for the first time today get `lastTriggeredOn` and, when the user
 * allows it, an email.
 */
export const evaluate = internalMutation({
  args: { userId: v.id("users"), date: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);
    const rows = await evaluatedAlerts(ctx, args.userId, args.date);
    const fresh = [];
    for (const { doc, view } of rows) {
      if (view.status !== "triggered" || doc.lastTriggeredOn === args.date)
        continue;
      await ctx.db.patch("alerts", doc._id, { lastTriggeredOn: args.date });
      fresh.push(view);
    }
    if (fresh.length && user?.contactEmail && !user.isSeed && user.emailAlerts !== false)
      await ctx.scheduler.runAfter(0, internal.email.sendPriceAlerts, {
        email: user.contactEmail,
        name: user.name,
        alerts: fresh.map((a) => ({
          crop: a.crop.name,
          market: a.market.name,
          condition: a.condition,
          targetPrice: a.targetPrice,
          latest: a.latest ?? 0,
        })),
      });
    const alerts = rows.map((r) => r.view);
    return {
      alerts,
      triggeredCount: alerts.filter((a) => a.status === "triggered").length,
    };
  },
});

async function ownAlert(
  ctx: MutationCtx,
  userId: Id<"users">,
  alertId: Id<"alerts">,
) {
  const alert = await ctx.db.get("alerts", alertId);
  if (!alert) apiError("NOT_FOUND", 404, "Alert not found.");
  if (alert.userId !== userId)
    apiError("FORBIDDEN", 403, "You can only change your own alerts.");
  return alert;
}

async function checkRefs(
  ctx: MutationCtx,
  cropId: Id<"crops">,
  marketId: Id<"markets">,
) {
  if (!(await ctx.db.get("crops", cropId)))
    apiError("CROP_NOT_FOUND", 400, "Unknown crop.");
  if (!(await ctx.db.get("markets", marketId)))
    apiError("MARKET_NOT_FOUND", 400, "Unknown market.");
}

export const get = internalQuery({
  args: { userId: v.id("users"), alertId: v.id("alerts"), date: v.string() },
  handler: async (ctx, args) => {
    const rows = await evaluatedAlerts(ctx, args.userId, args.date);
    return rows.find((r) => r.doc._id === args.alertId)?.view ?? null;
  },
});

export const create = internalMutation({
  args: {
    userId: v.id("users"),
    cropId: v.id("crops"),
    marketId: v.id("markets"),
    condition: conditionValidator,
    targetPrice: v.number(),
    active: v.boolean(),
  },
  handler: async (ctx, args): Promise<Id<"alerts">> => {
    await checkRefs(ctx, args.cropId, args.marketId);
    const existing = await ctx.db
      .query("alerts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(MAX_ALERTS);
    if (existing.length >= MAX_ALERTS)
      apiError("TOO_MANY_ALERTS", 400, `Keep at most ${MAX_ALERTS} alerts.`);
    return await ctx.db.insert("alerts", args);
  },
});

export const update = internalMutation({
  args: {
    userId: v.id("users"),
    alertId: v.id("alerts"),
    patch: v.object({
      cropId: v.optional(v.id("crops")),
      marketId: v.optional(v.id("markets")),
      condition: v.optional(conditionValidator),
      targetPrice: v.optional(v.number()),
      active: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, args): Promise<null> => {
    const alert = await ownAlert(ctx, args.userId, args.alertId);
    await checkRefs(
      ctx,
      args.patch.cropId ?? alert.cropId,
      args.patch.marketId ?? alert.marketId,
    );
    const changedRule =
      args.patch.cropId !== undefined ||
      args.patch.marketId !== undefined ||
      args.patch.condition !== undefined ||
      args.patch.targetPrice !== undefined;
    // A new rule may trigger again today, so allow a fresh email.
    await ctx.db.patch("alerts", alert._id, {
      ...args.patch,
      ...(changedRule ? { lastTriggeredOn: undefined } : {}),
    });
    return null;
  },
});

export const remove = internalMutation({
  args: { userId: v.id("users"), alertId: v.id("alerts") },
  handler: async (ctx, args): Promise<null> => {
    const alert = await ownAlert(ctx, args.userId, args.alertId);
    await ctx.db.delete("alerts", alert._id);
    return null;
  },
});
