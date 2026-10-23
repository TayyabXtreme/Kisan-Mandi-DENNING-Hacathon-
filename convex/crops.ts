import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { apiError } from "./lib/errors";
import { cropTitle } from "./lib/kisan";
import { allCrops, cropView } from "./prices";
import { categoryValidator } from "./schema";

/** Custom crops one farmer may add. */
const MAX_CUSTOM_PER_USER = 10;

export const list = internalQuery({
  args: {},
  handler: async (ctx) => (await allCrops(ctx)).map(cropView),
});

export const get = internalQuery({
  args: { id: v.id("crops") },
  handler: async (ctx, args) => {
    const crop = await ctx.db.get("crops", args.id);
    return crop ? cropView(crop) : null;
  },
});

/** Adds a crop to the shared list, or returns the existing one with that name. */
export const create = internalMutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    nameUr: v.optional(v.string()),
    category: categoryValidator,
  },
  handler: async (ctx, args): Promise<{ id: Id<"crops">; created: boolean }> => {
    const name = cropTitle(args.name);
    const existing = await ctx.db
      .query("crops")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (existing) return { id: existing._id, created: false };

    const mine = await ctx.db
      .query("crops")
      .withIndex("by_createdBy", (q) => q.eq("createdBy", args.userId))
      .take(MAX_CUSTOM_PER_USER);
    if (mine.length >= MAX_CUSTOM_PER_USER)
      apiError("CROP_LIMIT", 400, `You can add up to ${MAX_CUSTOM_PER_USER} crops.`);

    const id = await ctx.db.insert("crops", {
      name,
      nameUr: args.nameUr?.trim() ?? "",
      nameSd: "",
      category: args.category,
      // Unknown icon keys fall back to a sprout in the app.
      icon: "custom",
      createdBy: args.userId,
    });
    return { id, created: true };
  },
});
