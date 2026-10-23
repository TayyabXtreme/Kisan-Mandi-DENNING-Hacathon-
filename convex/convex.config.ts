import agent from "@convex-dev/agent/convex.config";
import betterAuth from "@convex-dev/better-auth/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    BETTER_AUTH_SECRET: v.string(),
    SITE_URL: v.string(),
    // Google OAuth is optional in local development; configure both to enable it.
    GOOGLE_CLIENT_ID: v.optional(v.string()),
    GOOGLE_CLIENT_SECRET: v.optional(v.string()),
    // Comma-separated sign-in emails with admin rights (markets, requests).
    ADMIN_EMAILS: v.optional(v.string()),
    // Resend: price-alert emails.
    RESEND_API_KEY: v.string(),
    RESEND_FROM_EMAIL: v.string(),
    // AI providers are optional so the app deploys before keys are added.
    GROQ_API_KEY: v.optional(v.string()),
    GROQ_MODEL: v.optional(v.string()),
    GROQ_WHISPER_MODEL: v.optional(v.string()),
    AWS_REGION: v.optional(v.string()),
    AWS_ACCESS_KEY_ID: v.optional(v.string()),
    AWS_SECRET_ACCESS_KEY: v.optional(v.string()),
    AWS_BEARER_TOKEN_BEDROCK: v.optional(v.string()),
    BEDROCK_MODEL_ID: v.optional(v.string()),
    // Kisan Dost assistant model; defaults to Claude Haiku 4.5 on Bedrock.
    ASSISTANT_MODEL_ID: v.optional(v.string()),
  },
});
app.use(betterAuth);
// Kisan Dost assistant: threads, messages and tool steps (convex/assistant.ts).
app.use(agent);
// Per-user AI quotas (convex/assistant_limits.ts).
app.use(rateLimiter);
export default app;
