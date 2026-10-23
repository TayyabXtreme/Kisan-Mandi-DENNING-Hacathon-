import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { authComponent, upsertAppUser } from "./auth";
import { isAdminEmail } from "./lib/admin";
import { langValidator, roleValidator } from "./schema";

async function findAppUser(ctx: QueryCtx, authId: string) {
  return await ctx.db
    .query("users")
    .withIndex("by_authId", (q) => q.eq("authId", authId))
    .unique();
}

/**
 * The signed-in, verified user's row in the app `users` table.
 * Use it in every private query/mutation: `const user = await requireUser(ctx);`
 * then store `user._id` (an Id<"users">) on the rows you create.
 * In mutations a missing row is created on the spot.
 */
export async function requireUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users">> {
  const authUser = await authComponent.getAuthUser(ctx);
  const user = await findAppUser(ctx, authUser._id);
  if (user) return user;
  if ("scheduler" in ctx) {
    await upsertAppUser(ctx, authUser);
    const created = await findAppUser(ctx, authUser._id);
    if (created) return created;
  }
  throw new Error("Your profile is still being set up. Try again.");
}

/**
 * The signed-in user's profile. Null when signed out, or for a moment while
 * `ensure` creates the row.
 */
export const me = query({
  args: {},
  handler: async (ctx) => {
    if (!(await ctx.auth.getUserIdentity())) return null;
    const authUser = await authComponent.getAuthUser(ctx);
    return await findAppUser(ctx, authUser._id);
  },
});

/**
 * Creates or refreshes the signed-in user's row. The app calls this after
 * every login, so the table heals itself even if rows are deleted by hand.
 */
export const ensure = mutation({
  args: {},
  handler: async (ctx): Promise<null> => {
    if (!(await ctx.auth.getUserIdentity())) return null;
    await upsertAppUser(ctx, await authComponent.getAuthUser(ctx));
    return null;
  },
});

/**
 * Deletes app `users` rows whose auth user no longer exists (for example after
 * deleting auth rows in the dashboard, which skips triggers).
 * Run: npx convex run users:removeOrphans
 */
export const removeOrphans = internalMutation({
  args: {},
  handler: async (ctx): Promise<number> => {
    let removed = 0;
    for (const user of await ctx.db.query("users").take(500)) {
      const authUser = await ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: "user",
        where: [{ field: "_id", value: user.authId }],
      });
      if (!authUser) {
        await ctx.db.delete("users", user._id);
        removed++;
      }
    }
    return removed;
  },
});

/**
 * Copies users created before the sync triggers existed.
 * Run once: npx convex run users:backfill
 */
export const backfill = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args): Promise<number> => {
    const page = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "user",
      paginationOpts: { numItems: 100, cursor: args.cursor ?? null },
    });
    for (const user of page.page) await upsertAppUser(ctx, user);
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.users.backfill, {
        cursor: page.continueCursor,
      });
    return page.page.length;
  },
});

const userView = (user: Doc<"users">) => ({
  // From the verified sign-in email only: contactEmail is user-editable.
  isAdmin: isAdminEmail(user.email, user.emailVerified),
  id: user._id,
  name: user.name,
  // The email they typed wins; otherwise the sign-in email (Google or
  // email/password). Old anonymous device accounts have a placeholder.
  email: user.contactEmail ?? (/^temp[-@]/i.test(user.email ?? "") ? "" : (user.email ?? "")),
  image: user.image ?? null,
  authId: user.authId,
  phone: user.phone ?? null,
  district: user.district ?? null,
  role: user.role ?? null,
  language: user.language ?? "en",
  marketId: user.marketId ?? null,
  emailAlerts: user.emailAlerts ?? true,
});
export type UserView = ReturnType<typeof userView>;

/**
 * The REST layer's view of the caller: null when signed out or unverified.
 * Auth identity flows from the HTTP action into this query.
 */
export const apiUser = internalQuery({
  args: {},
  handler: async (ctx) => {
    if (!(await ctx.auth.getUserIdentity())) return null;
    const authUser = await authComponent.safeGetAuthUser(ctx);
    if (!authUser) return null;
    const user = await findAppUser(ctx, authUser._id);
    return user ? userView(user) : null;
  },
});

/** The REST view of one user (for callers authenticated another way, e.g. MCP). */
export const viewById = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);
    return user ? userView(user) : null;
  },
});

/**
 * Whether a sign-in email already has an account. Sign-up needs this: with
 * email verification on, Better Auth answers a duplicate sign-up with a fake
 * success (no account, no code), which would strand the user on the code screen.
 */
export const emailRegistered = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.trim().toLowerCase()))
      .first();
    return user !== null;
  },
});

/** Saves profile fields. Picks the market in the user's district by default. */
export const updateProfile = internalMutation({
  args: {
    userId: v.id("users"),
    patch: v.object({
      name: v.optional(v.string()),
      contactEmail: v.optional(v.string()),
      phone: v.optional(v.string()),
      district: v.optional(v.string()),
      role: v.optional(roleValidator),
      language: v.optional(langValidator),
      marketId: v.optional(v.id("markets")),
      emailAlerts: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);
    if (!user) return null;
    const patch = { ...args.patch };
    if (patch.marketId && !(await ctx.db.get("markets", patch.marketId)))
      delete patch.marketId;
    if (!patch.marketId && !user.marketId) {
      const district = patch.district ?? user.district;
      const local = district
        ? await ctx.db
            .query("markets")
            .withIndex("by_district", (q) => q.eq("district", district))
            .first()
        : null;
      const fallback = local ?? (await ctx.db.query("markets").first());
      if (fallback) patch.marketId = fallback._id;
    }
    await ctx.db.patch("users", user._id, patch);
    const updated = await ctx.db.get("users", user._id);
    return updated ? userView(updated) : null;
  },
});
