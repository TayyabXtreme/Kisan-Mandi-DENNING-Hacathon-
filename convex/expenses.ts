// A farmer's crop expenses (seed, fertilizer, labour…). Read and written
// through the REST API (convex/rest/routes.ts); totals feed the dashboard.
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { apiError } from "./lib/errors";
import { cropView } from "./prices";
import { expenseCategoryValidator } from "./schema";

/** Per-user cap on rows read (a season's records stay far below). */
export const EXPENSE_LIMIT = 1000;

/** Newest first, optionally for one crop. */
export const list = internalQuery({
  args: { userId: v.id("users"), cropId: v.optional(v.id("crops")) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("expenses")
      .withIndex("by_userId_and_date", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(EXPENSE_LIMIT);
    const items = [];
    let total = 0;
    for (const row of rows) {
      if (args.cropId && row.cropId !== args.cropId) continue;
      const crop = await ctx.db.get("crops", row.cropId);
      if (!crop) continue;
      total += row.amount;
      items.push({
        id: row._id,
        crop: cropView(crop),
        category: row.category,
        amount: row.amount,
        note: row.note ?? null,
        date: row.date,
        createdAt: row._creationTime,
      });
    }
    return { items, total };
  },
});

const fields = {
  cropId: v.id("crops"),
  category: expenseCategoryValidator,
  amount: v.number(),
  note: v.optional(v.string()),
  date: v.string(),
};

async function ownExpense(ctx: MutationCtx, userId: Id<"users">, expenseId: Id<"expenses">) {
  const row = await ctx.db.get("expenses", expenseId);
  if (!row) apiError("NOT_FOUND", 404, "Expense not found.");
  if (row.userId !== userId) apiError("FORBIDDEN", 403, "You can only change your own expenses.");
  return row;
}

export const create = internalMutation({
  args: { userId: v.id("users"), ...fields },
  handler: async (ctx, args): Promise<Id<"expenses">> => {
    if (!(await ctx.db.get("crops", args.cropId))) apiError("CROP_NOT_FOUND", 400, "Unknown crop.");
    return await ctx.db.insert("expenses", { ...args, amount: Math.round(args.amount) });
  },
});

export const update = internalMutation({
  args: { userId: v.id("users"), expenseId: v.id("expenses"), ...fields },
  handler: async (ctx, { userId, expenseId, ...patch }): Promise<null> => {
    const row = await ownExpense(ctx, userId, expenseId);
    if (!(await ctx.db.get("crops", patch.cropId))) apiError("CROP_NOT_FOUND", 400, "Unknown crop.");
    await ctx.db.patch("expenses", row._id, { ...patch, amount: Math.round(patch.amount) });
    return null;
  },
});

export const remove = internalMutation({
  args: { userId: v.id("users"), expenseId: v.id("expenses") },
  handler: async (ctx, args): Promise<null> => {
    const row = await ownExpense(ctx, args.userId, args.expenseId);
    await ctx.db.delete("expenses", row._id);
    return null;
  },
});
