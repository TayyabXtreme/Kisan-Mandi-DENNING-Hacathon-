// Per-user AI quotas (plan R7), shared by Kisan Dost and the older AI
// endpoints. Works from mutations and actions (both have runMutation).
import { HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { apiError } from "./lib/errors";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  /** Kisan Dost messages (typed, spoken or a Confirm/Cancel tap). */
  assistantMessage: { kind: "token bucket", rate: 30, period: HOUR, capacity: 30 },
  /** "Sell now or wait?" advice (only cache misses count). */
  aiAdvice: { kind: "token bucket", rate: 30, period: HOUR, capacity: 15 },
  /** Voice → listing form parsing. */
  aiParseListing: { kind: "token bucket", rate: 30, period: HOUR, capacity: 10 },
  /** Groq Whisper speech to text. */
  aiTranscribe: { kind: "token bucket", rate: 60, period: HOUR, capacity: 20 },
});

export type AiLimit = "assistantMessage" | "aiAdvice" | "aiParseListing" | "aiTranscribe";

/**
 * Consumes one unit of `name` for `key` (a user id or auth token identifier).
 * Throws RATE_LIMITED (HTTP 429 through the REST layer) when the quota is used up.
 */
export async function enforceAiLimit(
  ctx: MutationCtx | ActionCtx,
  name: AiLimit,
  key: string,
) {
  const status = await rateLimiter.limit(ctx, name, { key });
  if (!status.ok) {
    const minutes = Math.max(1, Math.ceil((status.retryAfter ?? 60_000) / 60_000));
    apiError(
      "RATE_LIMITED",
      429,
      `You've asked a lot in the last hour. Try again in about ${minutes} min.`,
    );
  }
}
