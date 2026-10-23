// Personal MCP server: lets a farmer or buyer connect ChatGPT, Claude (or any
// MCP client) to their own KisanMandi data. Stateless Streamable HTTP: each
// POST carries JSON-RPC and gets a JSON reply. Auth is the user's secret,
// either in the URL (/mcp/km_…, works in every client's "add connector" box)
// or as "Authorization: Bearer km_…". Tools are read-only.
import { HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import type { HttpRouter } from "convex/server";
import { components, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { env, httpAction, type ActionCtx } from "../_generated/server";
import { APP_NAME } from "../lib/app_info";
import { isApiErrorData } from "../lib/errors";
import { CATEGORIES, HISTORY_DAYS, todayPK } from "../lib/kisan";
import type { UserView } from "../users";
import { API, json, route } from "./helpers";
import { ConvexError } from "convex/values";

export const MCP_PATH = "/mcp";
const SECRET_PREFIX = "km_";
/** Newest first; we answer with the client's version when we support it. */
const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const limiter = new RateLimiter(components.rateLimiter, {
  /** Tool calls per user, across all their connected AI apps. */
  mcpCall: { kind: "token bucket", rate: 300, period: HOUR, capacity: 60 },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

// ---------- secrets ----------

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** "km_" + 32 random bytes, base64url. */
function newSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return SECRET_PREFIX + b64;
}

const mcpUrl = (secret: string) => `${env.CONVEX_SITE_URL}${MCP_PATH}/${secret}`;

// ---------- tools ----------

type ToolCtx = { ctx: ActionCtx; user: UserView; today: string };
type Args = Record<string, unknown>;

class ToolError extends Error {}

const str = (args: Args, key: string) => {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

/** A market by id or (part of) its name; defaults to the user's own mandi. */
async function resolveMarket(c: ToolCtx, input: string | undefined) {
  const markets = await c.ctx.runQuery(internal.markets.list, {});
  if (!input) {
    const own = markets.find((m) => m.id === c.user.marketId);
    if (own) return own;
    throw new ToolError("No market given and the user has no default mandi. Pass a market name (see list_markets).");
  }
  const q = input.toLowerCase();
  const found =
    markets.find((m) => m.id === input) ??
    markets.find((m) => m.name.toLowerCase() === q) ??
    markets.find((m) => m.name.toLowerCase().includes(q) || m.nameUr.includes(input)) ??
    markets.find((m) => m.district.toLowerCase() === q);
  if (!found)
    throw new ToolError(`No market matches "${input}". Known markets: ${markets.map((m) => m.name).join(", ")}.`);
  return found;
}

/** A crop by id, English / Urdu / Sindhi name. */
async function resolveCrop(c: ToolCtx, input: string | undefined) {
  if (!input) throw new ToolError("Pass a crop name (see list_crops).");
  const crops = await c.ctx.runQuery(internal.crops.list, {});
  const q = input.toLowerCase();
  const found =
    crops.find((x) => x.id === input) ??
    crops.find((x) => x.name.toLowerCase() === q) ??
    crops.find(
      (x) => x.name.toLowerCase().includes(q) || x.nameUr.includes(input) || x.nameSd.includes(input),
    );
  if (!found)
    throw new ToolError(`No crop matches "${input}". Known crops: ${crops.map((x) => x.name).join(", ")}.`);
  return found;
}

type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  /** Only listed / callable for farmers. */
  farmerOnly?: boolean;
  run: (c: ToolCtx, args: Args) => Promise<unknown>;
};

const marketArg = {
  type: "string",
  description: "Market (mandi) name or id. Optional: defaults to the user's own mandi.",
};
const cropArg = { type: "string", description: "Crop name in English, Urdu or Sindhi (e.g. Wheat, Onion)." };

const TOOLS: Tool[] = [
  {
    name: "get_my_profile",
    title: "My profile",
    description: "The connected user's KisanMandi profile: name, role (farmer or buyer), district and default mandi.",
    inputSchema: { type: "object", properties: {} },
    run: async (c) => {
      const markets = await c.ctx.runQuery(internal.markets.list, {});
      const u = c.user;
      return {
        name: u.name,
        role: u.role,
        district: u.district,
        defaultMarket: markets.find((m) => m.id === u.marketId)?.name ?? null,
        email: u.email || null,
        phone: u.phone,
        today: c.today,
      };
    },
  },
  {
    name: "list_markets",
    title: "List markets",
    description: "All mandis (markets) with their district. Optionally filter by district.",
    inputSchema: { type: "object", properties: { district: { type: "string", description: "District name, e.g. Hyderabad." } } },
    run: async (c, args) => {
      const district = str(args, "district")?.toLowerCase();
      const markets = await c.ctx.runQuery(internal.markets.list, {});
      return markets
        .filter((m) => !district || m.district.toLowerCase() === district)
        .map((m) => ({ id: m.id, name: m.name, nameUrdu: m.nameUr || undefined, district: m.district }));
    },
  },
  {
    name: "list_crops",
    title: "List crops",
    description: "All crops with their category and Urdu name.",
    inputSchema: { type: "object", properties: {} },
    run: async (c) =>
      (await c.ctx.runQuery(internal.crops.list, {})).map((x) => ({
        id: x.id,
        name: x.name,
        nameUrdu: x.nameUr || undefined,
        category: x.category,
      })),
  },
  {
    name: "get_prices",
    title: "Today's prices",
    description:
      "Today's mandi prices in one market (Rs per 40 kg = one maund), with the change since the previous day. Optionally narrow to one crop or category.",
    inputSchema: {
      type: "object",
      properties: {
        market: marketArg,
        crop: { ...cropArg, description: "Optional: only this crop." },
        category: { type: "string", enum: [...CATEGORIES], description: "Optional: only this category." },
      },
    },
    run: async (c, args) => {
      const market = await resolveMarket(c, str(args, "market"));
      const cropQuery = str(args, "crop")?.toLowerCase();
      const category = str(args, "category");
      const data = await c.ctx.runQuery(internal.prices.today, {
        marketId: market.id as Id<"markets">,
        date: c.today,
      });
      if (!data) throw new ToolError("Market not found.");
      return {
        market: market.name,
        district: market.district,
        unit: "Rs per 40 kg",
        asOf: data.asOf,
        publishedBy: data.publishedBy?.name ?? "auto-updated daily",
        prices: data.items
          .filter(
            (row) =>
              (!category || row.crop.category === category) &&
              (!cropQuery ||
                row.crop.name.toLowerCase().includes(cropQuery) ||
                row.crop.nameUr.includes(cropQuery)),
          )
          .map((row) => ({
            crop: row.crop.name,
            category: row.crop.category,
            price: row.price,
            previous: row.previous,
            change: row.change,
            changePct: row.changePct,
            date: row.date,
          })),
      };
    },
  },
  {
    name: "get_price_history",
    title: "Price history",
    description: `Daily price history of one crop in one market (up to 30 days, default ${HISTORY_DAYS}), with min, max and average. Rs per 40 kg.`,
    inputSchema: {
      type: "object",
      properties: {
        crop: cropArg,
        market: marketArg,
        days: { type: "number", minimum: 2, maximum: 30, description: `Number of days (default ${HISTORY_DAYS}).` },
      },
      required: ["crop"],
    },
    run: async (c, args) => {
      const crop = await resolveCrop(c, str(args, "crop"));
      const market = await resolveMarket(c, str(args, "market"));
      const days = typeof args.days === "number" ? Math.min(30, Math.max(2, Math.round(args.days))) : HISTORY_DAYS;
      const data = await c.ctx.runQuery(internal.prices.history, {
        cropId: crop.id as Id<"crops">,
        marketId: market.id as Id<"markets">,
        date: c.today,
        days,
      });
      if (!data) throw new ToolError("Crop or market not found.");
      return { unit: "Rs per 40 kg", ...data };
    },
  },
  {
    name: "compare_markets",
    title: "Compare markets",
    description: "Latest price of one crop in every mandi, best price first. Use it to find where to sell or buy.",
    inputSchema: { type: "object", properties: { crop: cropArg }, required: ["crop"] },
    run: async (c, args) => {
      const crop = await resolveCrop(c, str(args, "crop"));
      const data = await c.ctx.runQuery(internal.prices.compare, {
        cropId: crop.id as Id<"crops">,
        marketId: (c.user.marketId ?? undefined) as Id<"markets"> | undefined,
        date: c.today,
      });
      return { crop: crop.name, unit: "Rs per 40 kg", ...data };
    },
  },
  {
    name: "search_marketplace",
    title: "Search marketplace",
    description: "Produce listings farmers have posted for sale. Filter by text, crop or district; sort newest or cheapest.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free text, e.g. 'basmati'." },
        crop: { ...cropArg, description: "Optional: only this crop." },
        district: { type: "string", description: "Optional: only listings in this district." },
        sort: { type: "string", enum: ["newest", "price_asc"] },
      },
    },
    run: async (c, args) => {
      const cropName = str(args, "crop");
      const crop = cropName ? await resolveCrop(c, cropName) : undefined;
      const items = await c.ctx.runQuery(internal.listings.search, {
        viewerId: c.user.id,
        date: c.today,
        q: str(args, "query"),
        cropId: crop?.id as Id<"crops"> | undefined,
        district: str(args, "district"),
        sort: str(args, "sort") === "price_asc" ? "price_asc" : "newest",
      });
      return { count: items.length, listings: items.slice(0, 25) };
    },
  },
  {
    name: "get_my_alerts",
    title: "My price alerts",
    description: "The farmer's price alerts and whether each has triggered at today's prices.",
    inputSchema: { type: "object", properties: {} },
    farmerOnly: true,
    run: async (c) => c.ctx.runMutation(internal.alerts.evaluate, { userId: c.user.id, date: c.today }),
  },
  {
    name: "get_my_listings",
    title: "My listings",
    description: "The farmer's own marketplace listings (active or sold), compared with market prices.",
    inputSchema: {
      type: "object",
      properties: { status: { type: "string", enum: ["active", "sold"], description: "Default: active." } },
    },
    farmerOnly: true,
    run: async (c, args) =>
      c.ctx.runQuery(internal.listings.mine, {
        userId: c.user.id,
        status: str(args, "status") === "sold" ? "sold" : "active",
        date: c.today,
      }),
  },
];

const toolsFor = (user: UserView) => TOOLS.filter((t) => !t.farmerOnly || user.role === "farmer");

// ---------- JSON-RPC ----------

type RpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

const rpcResult = (id: RpcRequest["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id: RpcRequest["id"], code: number, message: string) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message },
});

function errorMessage(e: unknown) {
  if (e instanceof ToolError) return e.message;
  if (e instanceof ConvexError && isApiErrorData(e.data)) return e.data.message;
  console.error("MCP tool failed", e);
  return "Something went wrong reading KisanMandi data.";
}

async function handle(msg: RpcRequest, c: ToolCtx): Promise<object | null> {
  const isNotification = msg.id === undefined;
  switch (msg.method) {
    case "initialize": {
      const asked = typeof msg.params?.protocolVersion === "string" ? msg.params.protocolVersion : "";
      return rpcResult(msg.id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "kisanmandi", title: APP_NAME, version: "1.0.0" },
        instructions:
          `${APP_NAME} data for ${c.user.name || "this user"} (${c.user.role ?? "user"}). ` +
          "Prices are Pakistani rupees per 40 kg (one maund) in Sindh mandis; dates are Pakistan time. " +
          "Markets and crops can be passed by name. Without a market, the user's own mandi is used.",
      });
    }
    case "ping":
      return isNotification ? null : rpcResult(msg.id, {});
    case "tools/list":
      return rpcResult(msg.id, {
        tools: toolsFor(c.user).map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { title: t.title, readOnlyHint: true, openWorldHint: false },
        })),
      });
    case "tools/call": {
      const name = msg.params?.name;
      const tool = toolsFor(c.user).find((t) => t.name === name);
      if (!tool) return rpcError(msg.id, -32602, `Unknown tool: ${String(name)}`);
      const limit = await limiter.limit(c.ctx, "mcpCall", { key: c.user.id });
      if (!limit.ok)
        return rpcResult(msg.id, {
          content: [{ type: "text", text: "Too many requests this hour. Try again in a few minutes." }],
          isError: true,
        });
      try {
        const args = (msg.params?.arguments ?? {}) as Args;
        const result = await tool.run(c, args);
        return rpcResult(msg.id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
      } catch (e) {
        return rpcResult(msg.id, { content: [{ type: "text", text: errorMessage(e) }], isError: true });
      }
    }
    // Some clients ask for these even when not advertised.
    case "resources/list":
      return rpcResult(msg.id, { resources: [] });
    case "resources/templates/list":
      return rpcResult(msg.id, { resourceTemplates: [] });
    case "prompts/list":
      return rpcResult(msg.id, { prompts: [] });
    default:
      // Notifications (notifications/initialized, cancelled…) need no reply.
      return isNotification ? null : rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

/** Secret from /mcp/<secret> or an "Authorization: Bearer <secret>" header. */
function secretOf(req: Request) {
  const path = new URL(req.url).pathname;
  const fromPath = path.startsWith(`${MCP_PATH}/`) ? decodeURIComponent(path.slice(MCP_PATH.length + 1)) : "";
  const header = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const secret = fromPath || header;
  return secret.startsWith(SECRET_PREFIX) ? secret : null;
}

const mcpJson = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });

const mcpPost = httpAction(async (ctx, req) => {
  const secret = secretOf(req);
  const key = secret ? await ctx.runQuery(internal.mcp_keys.byHash, { hash: await sha256Hex(secret) }) : null;
  const user = key ? await ctx.runQuery(internal.users.viewById, { userId: key.userId }) : null;
  if (!key || !user || !user.role)
    return mcpJson(
      rpcError(null, -32001, "This KisanMandi link is invalid or was revoked. Create a new one in the app: Profile → Connect AI."),
      401,
    );
  const now = Date.now();
  if (!key.lastUsedAt || now - key.lastUsedAt > 60_000)
    await ctx.runMutation(internal.mcp_keys.touch, { keyId: key.id, now });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return mcpJson(rpcError(null, -32700, "Parse error: send a JSON-RPC body."), 400);
  }
  const c: ToolCtx = { ctx, user, today: todayPK(now) };
  const batch = Array.isArray(body);
  const messages = (batch ? body : [body]) as RpcRequest[];
  if (!messages.length || messages.some((m) => !m || typeof m.method !== "string")) {
    // Responses from the client (no method) need no reply either.
    if (messages.every((m) => m && typeof m.method !== "string" && "result" in m))
      return new Response(null, { status: 202, headers: CORS });
    return mcpJson(rpcError(null, -32600, "Invalid JSON-RPC request."), 400);
  }
  const replies = (await Promise.all(messages.map((m) => handle(m, c)))).filter((r) => r !== null);
  if (!replies.length) return new Response(null, { status: 202, headers: CORS });
  return mcpJson(batch ? replies : replies[0]);
});

// Stateless server: no server-to-client stream and no sessions to end.
const mcpNotAllowed = httpAction(async () =>
  new Response(null, { status: 405, headers: { Allow: "POST", ...CORS } }),
);
const mcpOptions = httpAction(async () => new Response(null, { status: 204, headers: CORS }));

export function registerMcp(http: HttpRouter) {
  for (const target of [{ path: MCP_PATH }, { pathPrefix: `${MCP_PATH}/` }]) {
    http.route({ ...target, method: "POST", handler: mcpPost });
    http.route({ ...target, method: "GET", handler: mcpNotAllowed });
    http.route({ ...target, method: "DELETE", handler: mcpNotAllowed });
    http.route({ ...target, method: "OPTIONS", handler: mcpOptions });
  }

  // ---- the app's "Connect AI" screen ----
  route(http, "GET", `${API}/mcp-key`, "profile", async ({ ctx, user }) => ({
    key: await ctx.runQuery(internal.mcp_keys.status, { userId: user.id }),
  }));
  // Creates a new link (revoking the old one). The full URL is returned only here.
  route(http, "POST", `${API}/mcp-key`, "profile", async ({ ctx, user }) => {
    const secret = newSecret();
    await ctx.runMutation(internal.mcp_keys.replace, {
      userId: user.id,
      hash: await sha256Hex(secret),
      prefix: secret.slice(0, SECRET_PREFIX.length + 6),
    });
    return {
      url: mcpUrl(secret),
      key: await ctx.runQuery(internal.mcp_keys.status, { userId: user.id }),
    };
  });
  route(http, "DELETE", `${API}/mcp-key`, "profile", async ({ ctx, user }) => {
    await ctx.runMutation(internal.mcp_keys.revoke, { userId: user.id });
    return json({ ok: true });
  });
}
