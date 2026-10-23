// Limits for the signed-out "is this email registered?" check, so it can't be
// used to test long lists of emails.
import { HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { apiError } from "./lib/errors";

const limiter = new RateLimiter(components.rateLimiter, {
  /** Per client address (when the request carries one). */
  emailCheck: { kind: "token bucket", rate: 30, period: HOUR, capacity: 10 },
  /** Backstop across all callers. */
  emailCheckGlobal: { kind: "token bucket", rate: 600, period: HOUR, capacity: 100 },
});

/** Throws RATE_LIMITED (HTTP 429) when the email check is used too often. */
export async function enforceEmailCheckLimit(ctx: ActionCtx, req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const checks = await Promise.all([
    ip ? limiter.limit(ctx, "emailCheck", { key: ip }) : { ok: true },
    limiter.limit(ctx, "emailCheckGlobal"),
  ]);
  if (checks.some((c) => !c.ok))
    apiError("RATE_LIMITED", 429, "Too many tries. Wait a few minutes and try again.");
}
