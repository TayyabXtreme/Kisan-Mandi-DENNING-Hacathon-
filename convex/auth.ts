import { expo } from "@better-auth/expo";
import {
  createClient,
  type AuthFunctions,
  type GenericCtx,
} from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { emailOTP } from "better-auth/plugins";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { env, query, type MutationCtx } from "./_generated/server";
import authConfig from "./auth.config";
import { APP_NAME, APP_SCHEME } from "./lib/app_info";

const authFunctions: AuthFunctions = internal.auth;

type AuthUser = {
  _id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
};

const profile = (user: AuthUser) => ({
  name: user.name,
  email: user.email,
  emailVerified: user.emailVerified,
  image: user.image ?? undefined,
});

/** Create or update the app `users` row for a Better Auth user. */
export async function upsertAppUser(ctx: MutationCtx, user: AuthUser) {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_authId", (q) => q.eq("authId", user._id))
    .unique();
  // Profile fields can be edited independently, so identity refreshes update
  // only auth-owned fields and do not overwrite the user's profile name.
  if (existing)
    await ctx.db.patch("users", existing._id, {
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image ?? undefined,
    });
  else await ctx.db.insert("users", { authId: user._id, ...profile(user) });
}

// Triggers run in the same transaction as Better Auth's write, so the app
// `users` table never drifts from the auth `user` table.
export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    user: {
      onCreate: async (ctx, user) => upsertAppUser(ctx, user),
      onUpdate: async (ctx, user) => upsertAppUser(ctx, user),
      onDelete: async (ctx, user) => {
        const existing = await ctx.db
          .query("users")
          .withIndex("by_authId", (q) => q.eq("authId", user._id))
          .unique();
        if (existing) await ctx.db.delete("users", existing._id);
      },
    },
  },
});

export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi();

type OtpKind = "sign-in" | "email-verification" | "forget-password" | "change-email";

async function sendAuthCode(email: string, otp: string, type: OtpKind) {
  const purpose =
    type === "forget-password"
      ? "reset your password"
      : type === "change-email"
        ? "change your email"
        : type === "sign-in"
          ? "sign in"
          : "verify your email";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [email],
      subject: `${otp} is your ${APP_NAME} code`,
      text: `Use ${otp} to ${purpose} in ${APP_NAME}. This code expires in 10 minutes.`,
      html: `<div style="font-family:Arial,sans-serif;background:#f3eee4;padding:32px"><div style="max-width:440px;margin:auto;background:white;border-radius:16px;padding:28px;text-align:center"><h2 style="color:#2b2118;margin-top:0">${APP_NAME}</h2><p style="color:#7a6f64">Use this code to ${purpose}:</p><div style="font-size:32px;letter-spacing:8px;font-weight:700;color:#2f6b3c;margin:24px 0">${otp}</div><p style="color:#7a6f64;font-size:13px">This code expires in 10 minutes. If you did not request it, you can ignore this email.</p></div></div>`,
    }),
  });
  if (!response.ok) throw new Error(`Auth email failed with status ${response.status}`);
}

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {};

  return betterAuth({
    appName: APP_NAME,
    baseURL: env.CONVEX_SITE_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [`${APP_SCHEME}://`, `${APP_SCHEME}://*`, env.SITE_URL],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: { autoSignInAfterVerification: true },
    socialProviders: google,
    // Persist limits across serverless instances (limits account creation).
    rateLimit: { enabled: true, storage: "database" },
    plugins: [
      emailOTP({
        overrideDefaultEmailVerification: true,
        expiresIn: 600,
        allowedAttempts: 5,
        storeOTP: "hashed",
        async sendVerificationOTP({ email, otp, type }) {
          await sendAuthCode(email, otp, type);
        },
      }),
      expo(),
      convex({ authConfig }),
      crossDomain({ siteUrl: env.SITE_URL }),
    ],
  });
};

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    return {
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
    };
  },
});
