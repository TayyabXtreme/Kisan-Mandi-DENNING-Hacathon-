import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { createAuth } from "./auth";

/**
 * Creates (or resets) a verified email + password login, without sending a
 * verification email. Admin rights come from ADMIN_EMAILS, not from here.
 * Run from the CLI so the password never lives in code:
 *   npx convex run admin:setupAccount '{"email":"…","password":"…"}'
 */
export const setupAccount = internalAction({
  args: { email: v.string(), password: v.string(), name: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ created: boolean }> => {
    const email = args.email.trim().toLowerCase();
    if (args.password.length < 8) throw new Error("Password must be at least 8 characters.");

    const auth = await createAuth(ctx).$context;
    const hash = await auth.password.hash(args.password);
    const found = await auth.internalAdapter.findUserByEmail(email, { includeAccounts: true });

    let created = false;
    let userId: string;
    if (found) {
      userId = found.user.id;
      await auth.internalAdapter.updateUser(userId, { emailVerified: true });
      if (found.accounts.some((a) => a.providerId === "credential"))
        await auth.internalAdapter.updatePassword(userId, hash);
      else
        await auth.internalAdapter.linkAccount({
          userId,
          providerId: "credential",
          accountId: userId,
          password: hash,
        });
    } else {
      const user = await auth.internalAdapter.createUser({
        email,
        name: args.name ?? "Admin",
        emailVerified: true,
      });
      userId = user.id;
      await auth.internalAdapter.linkAccount({
        userId,
        providerId: "credential",
        accountId: userId,
        password: hash,
      });
      created = true;
    }

    // The auth trigger has mirrored the user into `users`; give it a profile
    // so the app opens straight into the tabs instead of profile setup.
    await ctx.runMutation(internal.admin.ensureProfile, { authId: userId, name: args.name ?? "Admin" });
    return { created };
  },
});

export const ensureProfile = internalMutation({
  args: { authId: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", args.authId))
      .unique();
    if (!user) throw new Error("App user row was not created for this account.");
    if (user.role) return null;
    const market = await ctx.db
      .query("markets")
      .withIndex("by_district", (q) => q.eq("district", "Hyderabad"))
      .first();
    await ctx.db.patch("users", user._id, {
      name: user.name || args.name,
      // Buyer: sees the Profile tab, where the Admin section lives.
      role: "buyer",
      district: "Hyderabad",
      marketId: market?._id,
    });
    return null;
  },
});
