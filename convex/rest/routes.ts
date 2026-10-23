import type { HttpRouter } from "convex/server";
import { z } from "zod";
import { internal } from "../_generated/api";
import {
  alertSchema,
  cropSchema,
  expenseSchema,
  GRADES,
  HISTORY_DAYS,
  LANGS,
  listingSchema,
  marketRequestSchema,
  marketSchema,
  pricePublishSchema,
  supportSchema,
  profilePatchSchema,
  toE164,
} from "../lib/kisan";
import { deleteAccountFully } from "../account";
import { enforceEmailCheckLimit } from "../auth_limits";
import { registerAssistantApi } from "./assistant_routes";
import { registerChatApi } from "./chat_routes";
import { API, asId, fail, idParam, parseBody, registerCors, route } from "./helpers";

/** KisanMandi REST API: users, crops, markets, prices, alerts, listings, ai. */
export function registerApi(http: HttpRouter) {
  registerCors(http);
  registerChatApi(http);
  registerAssistantApi(http);

  // ---- sign-up ----
  // Step 1 of sign-up asks this before continuing (see users.emailRegistered).
  route(http, "POST", `${API}/auth/email-status`, "public", async ({ ctx, req }) => {
    const body = await parseBody(req, z.object({ email: z.string().trim().toLowerCase().email("EMAIL_INVALID") }));
    await enforceEmailCheckLimit(ctx, req);
    return { exists: await ctx.runQuery(internal.users.emailRegistered, { email: body.email }) };
  });

  // ---- users ----
  route(http, "GET", `${API}/users/me`, "user", async ({ user }) => user);

  route(http, "PATCH", `${API}/users/me`, "user", async ({ ctx, req, user }) => {
    const body = await parseBody(req, profilePatchSchema);
    return await ctx.runMutation(internal.users.updateProfile, {
      userId: user.id,
      patch: {
        name: body.name,
        contactEmail: body.email,
        phone: body.phone ? toE164(body.phone) : undefined,
        district: body.district,
        role: body.role,
        language: body.language,
        marketId: body.marketId ? asId<"markets">(body.marketId) : undefined,
        emailAlerts: body.emailAlerts,
      },
    });
  });

  // Permanently deletes the caller's account and everything they own.
  route(http, "DELETE", `${API}/users/me`, "user", async ({ ctx, user }) => {
    await deleteAccountFully(ctx, { userId: user.id, authId: user.authId });
    return { ok: true };
  });

  // ---- crops & markets ----
  route(http, "GET", `${API}/crops`, "user", async ({ ctx }) => ({
    items: await ctx.runQuery(internal.crops.list, {}),
  }));
  route(http, "POST", `${API}/crops`, "farmer", async ({ ctx, req, user }) => {
    const body = await parseBody(req, cropSchema);
    return await ctx.runMutation(internal.crops.create, {
      userId: user.id,
      name: body.name,
      nameUr: body.nameUr || undefined,
      category: body.category,
    });
  });
  route(http, "GET", `${API}/markets`, "user", async ({ ctx }) => ({
    items: await ctx.runQuery(internal.markets.list, {}),
  }));
  // Only the admin adds markets; farmers and buyers send a request instead.
  route(http, "POST", `${API}/markets`, "admin", async ({ ctx, req, user }) => {
    const body = await parseBody(req, marketSchema);
    return await ctx.runMutation(internal.markets.create, {
      userId: user.id,
      name: body.name,
      nameUr: body.nameUr || undefined,
      district: body.district,
    });
  });

  route(http, "PATCH", `${API}/markets/*`, "admin", async ({ ctx, req, id }) => {
    const body = await parseBody(req, marketSchema);
    return await ctx.runMutation(internal.markets.update, {
      marketId: asId<"markets">(id),
      name: body.name,
      nameUr: body.nameUr || undefined,
      district: body.district,
    });
  });

  // Admin enters today's mandi prices for one market (Pakistan date).
  route(http, "POST", `${API}/admin/prices`, "admin", async ({ ctx, req, user, today }) => {
    const body = await parseBody(req, pricePublishSchema);
    return await ctx.runMutation(internal.prices.publish, {
      adminId: user.id,
      marketId: asId<"markets">(body.marketId),
      date: today,
      items: body.items.map((i) => ({ cropId: asId<"crops">(i.cropId), price: i.price })),
    });
  });

  // ---- contact admin ----
  route(http, "POST", `${API}/support`, "profile", async ({ ctx, req, user }) => {
    const body = await parseBody(req, supportSchema);
    return await ctx.runMutation(internal.support.create, {
      userId: user.id,
      topic: body.topic,
      message: body.message,
    });
  });
  // The admin sees every open message; others see their own.
  route(http, "GET", `${API}/support`, "profile", async ({ ctx, user }) => ({
    items: user.isAdmin
      ? await ctx.runQuery(internal.support.openMessages, {})
      : await ctx.runQuery(internal.support.myOpenMessages, { userId: user.id }),
  }));
  route(http, "PATCH", `${API}/support/*`, "admin", async ({ ctx, id }) =>
    ctx.runMutation(internal.support.resolve, { messageId: asId<"supportMessages">(id) }),
  );

  // ---- market requests ----
  route(http, "POST", `${API}/market-requests`, "profile", async ({ ctx, req, user }) => {
    const body = await parseBody(req, marketRequestSchema);
    return await ctx.runMutation(internal.markets.request, {
      userId: user.id,
      name: body.name,
      nameUr: body.nameUr || undefined,
      district: body.district,
      note: body.note || undefined,
    });
  });
  // The admin sees every pending request; others see their own.
  route(http, "GET", `${API}/market-requests`, "profile", async ({ ctx, user }) => ({
    items: user.isAdmin
      ? await ctx.runQuery(internal.markets.pendingRequests, {})
      : await ctx.runQuery(internal.markets.myPendingRequests, { userId: user.id }),
  }));
  route(http, "PATCH", `${API}/market-requests/*`, "admin", async ({ ctx, req, id }) => {
    const body = await parseBody(req, z.object({ action: z.enum(["approve", "reject"]) }));
    return await ctx.runMutation(internal.markets.resolveRequest, {
      requestId: asId<"marketRequests">(id),
      approve: body.action === "approve",
    });
  });

  // ---- prices ----
  route(http, "GET", `${API}/prices`, "profile", async ({ ctx, url, user, today }) => {
    const marketId = idParam<"markets">(url, "marketId") ?? user.marketId;
    if (!marketId) throw fail(400, "MISSING_PARAM", "Pass marketId.", "marketId");
    const data = await ctx.runQuery(internal.prices.today, { marketId, date: today });
    if (!data) throw fail(404, "NOT_FOUND", "Market not found.");
    const q = url.searchParams.get("q")?.trim().toLowerCase();
    const category = url.searchParams.get("category");
    const items = data.items.filter(
      (row) =>
        (!category || category === "all" || row.crop.category === category) &&
        (!q ||
          [row.crop.name, row.crop.nameUr, row.crop.nameSd].some((n) =>
            n.toLowerCase().includes(q),
          )),
    );
    return { ...data, today, items };
  });

  route(http, "GET", `${API}/prices/history`, "profile", async ({ ctx, url, today }) => {
    const days = Number(url.searchParams.get("days") ?? HISTORY_DAYS);
    const data = await ctx.runQuery(internal.prices.history, {
      cropId: idParam<"crops">(url, "cropId", true),
      marketId: idParam<"markets">(url, "marketId", true),
      date: today,
      days: Number.isFinite(days) ? days : HISTORY_DAYS,
    });
    if (!data) throw fail(404, "NOT_FOUND", "Crop or market not found.");
    return data;
  });

  route(http, "GET", `${API}/prices/compare`, "profile", async ({ ctx, url, today }) =>
    ctx.runQuery(internal.prices.compare, {
      cropId: idParam<"crops">(url, "cropId", true),
      marketId: idParam<"markets">(url, "marketId"),
      date: today,
    }),
  );

  // ---- alerts (farmers) ----
  // Every read re-evaluates the rules against the latest prices.
  route(http, "GET", `${API}/alerts`, "farmer", async ({ ctx, user, today }) =>
    ctx.runMutation(internal.alerts.evaluate, { userId: user.id, date: today }),
  );

  route(http, "GET", `${API}/alerts/*`, "farmer", async ({ ctx, user, id, today }) => {
    const alert = await ctx.runQuery(internal.alerts.get, {
      userId: user.id,
      alertId: asId<"alerts">(id),
      date: today,
    });
    if (!alert) throw fail(404, "NOT_FOUND", "Alert not found.");
    return alert;
  });

  route(http, "POST", `${API}/alerts`, "farmer", async ({ ctx, req, user }) => {
    const body = await parseBody(req, alertSchema);
    const id = await ctx.runMutation(internal.alerts.create, {
      userId: user.id,
      cropId: asId<"crops">(body.cropId),
      marketId: asId<"markets">(body.marketId),
      condition: body.condition,
      targetPrice: Math.round(body.targetPrice),
      active: body.active,
    });
    return { id };
  });

  route(http, "PATCH", `${API}/alerts/*`, "farmer", async ({ ctx, req, user, id }) => {
    const body = await parseBody(req, alertSchema.partial());
    await ctx.runMutation(internal.alerts.update, {
      userId: user.id,
      alertId: asId<"alerts">(id),
      patch: {
        cropId: body.cropId ? asId<"crops">(body.cropId) : undefined,
        marketId: body.marketId ? asId<"markets">(body.marketId) : undefined,
        condition: body.condition,
        targetPrice: body.targetPrice !== undefined ? Math.round(body.targetPrice) : undefined,
        active: body.active,
      },
    });
    return { ok: true };
  });

  route(http, "DELETE", `${API}/alerts/*`, "farmer", async ({ ctx, user, id }) => {
    await ctx.runMutation(internal.alerts.remove, {
      userId: user.id,
      alertId: asId<"alerts">(id),
    });
    return { ok: true };
  });

  // ---- listings ----
  route(http, "GET", `${API}/listings`, "profile", async ({ ctx, url, user, today }) => {
    const grade = url.searchParams.get("grade");
    const sort = url.searchParams.get("sort");
    const items = await ctx.runQuery(internal.listings.search, {
      viewerId: user.id,
      date: today,
      q: url.searchParams.get("q") ?? undefined,
      cropId: idParam<"crops">(url, "cropId"),
      district: url.searchParams.get("district") || undefined,
      grade: GRADES.find((g) => g === grade),
      sort: sort === "price_asc" ? "price_asc" : "newest",
    });
    return { items, count: items.length };
  });

  route(http, "GET", `${API}/listings/mine`, "farmer", async ({ ctx, url, user, today }) =>
    ctx.runQuery(internal.listings.mine, {
      userId: user.id,
      status: url.searchParams.get("status") === "sold" ? "sold" : "active",
      date: today,
    }),
  );

  route(http, "GET", `${API}/listings/*`, "profile", async ({ ctx, user, id, today }) => {
    const listing = await ctx.runQuery(internal.listings.get, {
      viewerId: user.id,
      listingId: asId<"listings">(id),
      date: today,
    });
    if (!listing) throw fail(404, "NOT_FOUND", "Listing not found.");
    return listing;
  });

  route(http, "POST", `${API}/listings`, "farmer", async ({ ctx, req, user, today }) => {
    const body = await parseBody(req, listingSchema(today));
    const id = await ctx.runMutation(internal.listings.create, {
      userId: user.id,
      cropId: asId<"crops">(body.cropId),
      quantity: body.quantity,
      askingPrice: Math.round(body.askingPrice),
      district: body.district,
      grade: body.grade,
      availableFrom: body.availableFrom,
      contactPhone: toE164(body.contactPhone),
    });
    return { id };
  });

  // PATCH body is either `{ status: "sold" | "active" }` or the full listing form.
  route(http, "PATCH", `${API}/listings/*`, "farmer", async ({ ctx, req, user, id, today }) => {
    const listingId = asId<"listings">(id);
    const raw: unknown = await req.clone().json().catch(() => null);
    const status = z
      .object({ status: z.enum(["active", "sold"]) })
      .strict()
      .safeParse(raw);
    if (status.success) {
      await ctx.runMutation(internal.listings.setStatus, {
        userId: user.id,
        listingId,
        status: status.data.status,
      });
      return { ok: true };
    }
    const existing = await ctx.runQuery(internal.listings.ownedDate, {
      userId: user.id,
      listingId,
    });
    if (!existing.exists) throw fail(404, "NOT_FOUND", "Listing not found.");
    if (!existing.owner) throw fail(403, "FORBIDDEN", "You can only change your own listings.");
    // An unchanged past date is fine when editing an older listing.
    const body = await parseBody(req, listingSchema(today, existing.availableFrom));
    await ctx.runMutation(internal.listings.update, {
      userId: user.id,
      listingId,
      cropId: asId<"crops">(body.cropId),
      quantity: body.quantity,
      askingPrice: Math.round(body.askingPrice),
      district: body.district,
      grade: body.grade,
      availableFrom: body.availableFrom,
      contactPhone: toE164(body.contactPhone),
    });
    return { ok: true };
  });

  route(http, "DELETE", `${API}/listings/*`, "farmer", async ({ ctx, user, id }) => {
    await ctx.runMutation(internal.listings.remove, {
      userId: user.id,
      listingId: asId<"listings">(id),
    });
    return { ok: true };
  });

  // ---- dashboard ----
  // Farmers: stock, budget, offers to answer, deals. Buyers: offers and purchases.
  route(http, "GET", `${API}/dashboard`, "profile", async ({ ctx, user, today }) =>
    user.role === "farmer"
      ? ctx.runQuery(internal.dashboard.farmer, { userId: user.id, date: today })
      : ctx.runQuery(internal.dashboard.buyer, { userId: user.id }),
  );

  // ---- crop expenses (farmers) ----
  route(http, "GET", `${API}/expenses`, "farmer", async ({ ctx, url, user }) =>
    ctx.runQuery(internal.expenses.list, { userId: user.id, cropId: idParam<"crops">(url, "cropId") }),
  );

  route(http, "POST", `${API}/expenses`, "farmer", async ({ ctx, req, user, today }) => {
    const body = await parseBody(req, expenseSchema(today));
    const id = await ctx.runMutation(internal.expenses.create, {
      userId: user.id,
      cropId: asId<"crops">(body.cropId),
      category: body.category,
      amount: body.amount,
      note: body.note || undefined,
      date: body.date,
    });
    return { id };
  });

  route(http, "PATCH", `${API}/expenses/*`, "farmer", async ({ ctx, req, user, id, today }) => {
    const body = await parseBody(req, expenseSchema(today));
    await ctx.runMutation(internal.expenses.update, {
      userId: user.id,
      expenseId: asId<"expenses">(id),
      cropId: asId<"crops">(body.cropId),
      category: body.category,
      amount: body.amount,
      note: body.note || undefined,
      date: body.date,
    });
    return { ok: true };
  });

  route(http, "DELETE", `${API}/expenses/*`, "farmer", async ({ ctx, user, id }) => {
    await ctx.runMutation(internal.expenses.remove, { userId: user.id, expenseId: asId<"expenses">(id) });
    return { ok: true };
  });

  // ---- AI (Bedrock) ----
  route(http, "POST", `${API}/ai/advice`, "profile", async ({ ctx, req, user, today }) => {
    const body = await parseBody(
      req,
      z.object({ cropId: z.string().min(1), marketId: z.string().min(1), language: z.enum(LANGS).optional() }),
    );
    return await ctx.runAction(internal.ai.priceAdvice, {
      cropId: asId<"crops">(body.cropId),
      marketId: asId<"markets">(body.marketId),
      date: today,
      language: body.language ?? user.language,
    });
  });

  route(http, "POST", `${API}/ai/parse-listing`, "farmer", async ({ ctx, req, today }) => {
    const body = await parseBody(req, z.object({ text: z.string().trim().min(2).max(1000) }));
    return await ctx.runAction(internal.ai.parseListing, { text: body.text, today });
  });
}
