import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import schema from "./schema";

const adviceValidator = schema.tables.adviceCache.validator.fields.advice;

export const getCached = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("adviceCache")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    return row?.advice ?? null;
  },
});

export const saveCached = internalMutation({
  args: { key: v.string(), advice: adviceValidator },
  handler: async (ctx, args): Promise<null> => {
    const row = await ctx.db
      .query("adviceCache")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (row) await ctx.db.patch("adviceCache", row._id, { advice: args.advice });
    else await ctx.db.insert("adviceCache", args);
    return null;
  },
});
