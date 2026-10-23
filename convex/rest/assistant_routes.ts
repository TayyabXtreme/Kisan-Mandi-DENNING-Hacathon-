import type { HttpRouter } from "convex/server";
import { z } from "zod";
import { internal } from "../_generated/api";
import { API, parseBody, route } from "./helpers";

/**
 * Kisan Dost REST endpoints. Replies arrive in the thread asynchronously; the
 * app watches them live with the `assistant.listThreadMessages` query.
 */
export function registerAssistantApi(http: HttpRouter) {
  // Recent conversations, newest first.
  route(http, "GET", `${API}/assistant/threads`, "profile", async ({ ctx, user }) => ({
    items: await ctx.runQuery(internal.assistant.listThreads, { userId: user.id }),
  }));

  route(http, "POST", `${API}/assistant/threads`, "profile", async ({ ctx, req, user }) => {
    const body = await parseBody(
      req,
      z.object({ title: z.string().trim().max(80).optional() }).optional().default({}),
    );
    const threadId = await ctx.runMutation(internal.assistant.createThread, {
      userId: user.id,
      title: body.title || undefined,
    });
    return { threadId };
  });

  route(http, "GET", `${API}/assistant/threads/*`, "profile", async ({ ctx, user, id }) =>
    ctx.runQuery(internal.assistant.threadView, { userId: user.id, threadId: id }),
  );

  // 429 RATE_LIMITED after ~30 messages an hour.
  route(http, "POST", `${API}/assistant/messages`, "profile", async ({ ctx, req, user }) => {
    const body = await parseBody(
      req,
      z.object({
        threadId: z.string().min(1),
        text: z.string().trim().min(1, "TEXT_REQUIRED").max(1000, "TEXT_TOO_LONG"),
      }),
    );
    return await ctx.runMutation(internal.assistant.sendMessage, {
      userId: user.id,
      threadId: body.threadId,
      text: body.text,
    });
  });

  // Confirm / Cancel a write-tool card (tool part state "approval-requested").
  route(http, "POST", `${API}/assistant/confirm`, "profile", async ({ ctx, req, user }) => {
    const body = await parseBody(
      req,
      z.object({
        threadId: z.string().min(1),
        approvalId: z.string().min(1),
        approved: z.boolean(),
      }),
    );
    return await ctx.runMutation(internal.assistant.respondToProposal, {
      userId: user.id,
      ...body,
    });
  });
}
