import type { HttpRouter } from "convex/server";
import { z } from "zod";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { API, asId, fail, parseBody, route, type RouteCtx } from "./helpers";

// Buyer <-> farmer chat REST API (docs/plan.md §7). The chat screens read
// through reactive Convex queries (api.conversations.*, api.messages.list);
// every write goes through these endpoints.

const sendSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), body: z.string().trim().min(1, "EMPTY_MESSAGE").max(2000, "MESSAGE_TOO_LONG") }),
  z.object({
    type: z.literal("image"),
    storageId: z.string().min(1, "FILE_REQUIRED"),
    body: z.string().max(500).optional(),
  }),
  z.object({
    type: z.literal("voice"),
    storageId: z.string().min(1, "FILE_REQUIRED"),
    durationMs: z.number().positive("BAD_DURATION"),
  }),
  z.object({
    type: z.literal("offer"),
    price: z.number().positive("PRICE_POSITIVE"),
    quantity: z.number().positive("QTY_POSITIVE"),
    body: z.string().max(500).optional(),
  }),
]);

/** `/api/v1/<collection>/<id>/<action>` → { id, action }. */
function idAndAction(url: URL, collection: string) {
  const rest = url.pathname.slice(`${API}/${collection}/`.length).split("/").filter(Boolean);
  if (!rest[0]) throw fail(404, "NOT_FOUND", "Not found.");
  return { id: decodeURIComponent(rest[0]), action: rest[1] ?? "" };
}

export function registerChatApi(http: HttpRouter) {
  // Find or create the caller's chat about a listing.
  route(http, "POST", `${API}/conversations`, "profile", async ({ ctx, req, user }) => {
    const body = await parseBody(req, z.object({ listingId: z.string().min(1, "MISSING_PARAM") }));
    return await ctx.runMutation(internal.conversations.findOrCreate, {
      userId: user.id,
      listingId: asId<"listings">(body.listingId),
    });
  });

  // Same data as the reactive Chats list (for clients without a socket).
  route(http, "GET", `${API}/conversations`, "profile", async ({ ctx, url }) => ({
    items: await ctx.runQuery(api.conversations.list, {
      archived: url.searchParams.get("archived") === "1",
    }),
  }));

  // { counts: { [listingId]: number } } for the farmer's My Listings chips.
  route(http, "GET", `${API}/conversations/counts`, "profile", async ({ ctx, user }) => ({
    counts: await ctx.runQuery(internal.conversations.countsByListing, { userId: user.id }),
  }));

  // GET /conversations/:id  ·  GET /conversations/:id/messages?cursor=&limit=
  route(http, "GET", `${API}/conversations/*`, "profile", async ({ ctx, url, today }) => {
    const { id, action } = idAndAction(url, "conversations");
    if (action === "messages") {
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 30) || 30));
      return await ctx.runQuery(api.messages.list, {
        conversationId: id,
        paginationOpts: { numItems: limit, cursor: url.searchParams.get("cursor") || null },
      });
    }
    if (action) throw fail(404, "NOT_FOUND", "Not found.");
    const conv = await ctx.runQuery(api.conversations.get, { conversationId: id, date: today });
    if (!conv) throw fail(404, "NOT_FOUND", "Chat not found.");
    return conv;
  });

  // POST /conversations/:id/(messages|read|archive|block|report)
  route(http, "POST", `${API}/conversations/*`, "profile", async (r: RouteCtx) => {
    const { ctx, req, url, user } = r;
    const { id, action } = idAndAction(url, "conversations");
    const conversationId = asId<"conversations">(id);
    switch (action) {
      case "messages": {
        const body = await parseBody(req, sendSchema);
        const messageId = await ctx.runMutation(internal.messages.send, {
          userId: user.id,
          conversationId,
          type: body.type,
          body: "body" in body ? body.body : undefined,
          storageId: "storageId" in body ? (body.storageId as Id<"_storage">) : undefined,
          durationMs: "durationMs" in body ? body.durationMs : undefined,
          offer: body.type === "offer" ? { price: body.price, quantity: body.quantity } : undefined,
        });
        return { id: messageId };
      }
      case "read":
        await ctx.runMutation(internal.conversations.markRead, { userId: user.id, conversationId });
        return { ok: true };
      case "archive": {
        const body = await parseBody(req, z.object({ archived: z.boolean() }));
        await ctx.runMutation(internal.conversations.setArchived, {
          userId: user.id,
          conversationId,
          archived: body.archived,
        });
        return { ok: true };
      }
      case "block": {
        const body = await parseBody(req, z.object({ blocked: z.boolean() }));
        await ctx.runMutation(internal.conversations.setBlocked, {
          userId: user.id,
          conversationId,
          blocked: body.blocked,
        });
        return { ok: true };
      }
      case "report": {
        const body = await parseBody(req, z.object({ reason: z.string().trim().min(1).max(500) }));
        await ctx.runMutation(internal.conversations.report, {
          userId: user.id,
          conversationId,
          reason: body.reason,
        });
        return { ok: true };
      }
      default:
        throw fail(404, "NOT_FOUND", "Not found.");
    }
  });

  // POST /messages/:id/offer {action: accept|decline|markSold, markSold?}
  route(http, "POST", `${API}/messages/*`, "profile", async ({ ctx, req, url, user }) => {
    const { id, action } = idAndAction(url, "messages");
    if (action !== "offer") throw fail(404, "NOT_FOUND", "Not found.");
    const body = await parseBody(
      req,
      z.object({ action: z.enum(["accept", "decline", "markSold"]), markSold: z.boolean().optional() }),
    );
    await ctx.runMutation(internal.messages.respondToOffer, {
      userId: user.id,
      messageId: asId<"messages">(id),
      action: body.action,
      markSold: body.markSold,
    });
    return { ok: true };
  });

  // DELETE /messages/:id → delete for me.
  route(http, "DELETE", `${API}/messages/*`, "profile", async ({ ctx, user, id }) => {
    await ctx.runMutation(internal.messages.deleteForMe, {
      userId: user.id,
      messageId: asId<"messages">(id),
    });
    return { ok: true };
  });

  // Short-lived URL to POST a photo or voice note to; send its storageId next.
  route(http, "POST", `${API}/chat/upload-url`, "profile", async ({ ctx }) => ({
    uploadUrl: await ctx.storage.generateUploadUrl(),
  }));
}
