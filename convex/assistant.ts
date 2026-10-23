// Kisan Dost: the farming assistant chat (plan §6), built on @convex-dev/agent.
// Threads, messages and tool steps live in the agent component. The app sends
// through REST (convex/rest/assistant_routes.ts) and reads the thread live with
// `listThreadMessages` (a documented exception to the REST-only rule).
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import {
  Agent,
  createTool,
  getThreadMetadata,
  listUIMessages,
  saveMessage,
  stepCountIs,
  syncStreams,
  vStreamArgs,
  type AgentComponent,
  type ToolCtx,
} from "@convex-dev/agent";
import type { ToolSet } from "ai";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { z } from "zod";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  env,
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { enforceAiLimit } from "./assistant_limits";
import { apiError } from "./lib/errors";
import { GRADES, HISTORY_DAYS, profit, todayPK, type Lang } from "./lib/kisan";
import { requireUser } from "./users";

const DEFAULT_ASSISTANT_MODEL = "us.anthropic.claude-haiku-4-5-20251001-v1:0";
const LANGUAGE_NAMES: Record<Lang, string> = {
  en: "English",
  ur: "Urdu (Urdu script)",
  sd: "Sindhi (Arabic script)",
};

function assistantModel() {
  // Same credentials as convex/ai.ts. Missing keys surface as a failed reply.
  const bedrock = createAmazonBedrock({
    region: env.AWS_REGION ?? "us-east-1",
    ...(env.AWS_BEARER_TOKEN_BEDROCK
      ? { apiKey: env.AWS_BEARER_TOKEN_BEDROCK }
      : {
          accessKeyId: env.AWS_ACCESS_KEY_ID ?? "",
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY ?? "",
        }),
  });
  return bedrock(env.ASSISTANT_MODEL_ID ?? DEFAULT_ASSISTANT_MODEL);
}

// ---------------------------------------------------------------------------
// Lookups used by the tools
// ---------------------------------------------------------------------------

/** Spoken / Roman-Urdu / Sindhi names the farmer may use for each crop. */
const CROP_ALIASES: Record<string, string[]> = {
  wheat: ["wheat", "gandum", "gundum", "kanak", "kank", "kanaq"],
  rice: ["rice", "chawal", "chaawal", "chawel", "chanwar", "chanwer", "dhan", "paddy"],
  cotton: ["cotton", "kapas", "kappas", "phutti", "kapah", "kapuh"],
  sugarcane: ["sugarcane", "sugar cane", "ganna", "gana", "kamand"],
  onion: ["onion", "pyaz", "piaz", "piyaz", "basar", "bassar"],
  tomato: ["tomato", "tamatar", "timatar", "tamatey", "tamata"],
  mango: ["mango", "aam", "amb", "anb"],
  banana: ["banana", "kela", "kelo", "kayla"],
};

const norm = (s: string) =>
  s.trim().toLowerCase().replace(/[\s_-]+/g, " ").replace(/[؟?.!،,]/g, "");

function findCrop(crops: Doc<"crops">[], input: string) {
  const q = norm(input);
  if (!q) return null;
  return (
    crops.find((c) =>
      [c.name, c.nameUr, c.nameSd].some((n) => norm(n) === q || q.includes(norm(n))),
    ) ??
    crops.find((c) =>
      (CROP_ALIASES[c.icon] ?? CROP_ALIASES[c.name.toLowerCase()] ?? []).some(
        (a) => q === a || q.split(" ").includes(a),
      ),
    ) ??
    null
  );
}

function findMarket(markets: Doc<"markets">[], input: string) {
  const q = norm(input).replace(/mandi|market|grain|منڈی|منڊي/g, "").trim();
  if (!q) return null;
  const squash = (s: string) => norm(s).replace(/\s/g, "");
  return (
    markets.find((m) =>
      [m.name, m.nameUr, m.nameSd, m.district].some(
        (n) => squash(n).includes(q.replace(/\s/g, "")) || q.includes(norm(m.district)),
      ),
    ) ?? null
  );
}

type Profile = {
  userId: Id<"users">;
  name: string;
  role: "farmer" | "buyer" | null;
  district: string | null;
  language: Lang;
  marketId: Id<"markets"> | null;
  marketName: string | null;
};

/** The thread owner's profile, for prompts and permission checks. */
export const profile = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<Profile | null> => {
    const user = await ctx.db.get("users", args.userId);
    if (!user) return null;
    const market = user.marketId ? await ctx.db.get("markets", user.marketId) : null;
    return {
      userId: user._id,
      name: user.name,
      role: user.role ?? null,
      district: user.district ?? null,
      language: user.language ?? "en",
      marketId: market?._id ?? null,
      marketName: market?.name ?? null,
    };
  },
});

type Resolved =
  | {
      ok: true;
      crop: { id: Id<"crops">; name: string; nameUr: string } | null;
      market: { id: Id<"markets">; name: string } | null;
    }
  | { ok: false; error: string };

/** Turns crop / market words into ids. Market defaults to the user's mandi. */
export const resolve = internalQuery({
  args: {
    userId: v.id("users"),
    crop: v.optional(v.string()),
    market: v.optional(v.string()),
    needCrop: v.boolean(),
  },
  handler: async (ctx, args): Promise<Resolved> => {
    const crops = await ctx.db.query("crops").take(100);
    const markets = await ctx.db.query("markets").take(50);
    let crop = null;
    if (args.crop) {
      crop = findCrop(crops, args.crop);
      if (!crop)
        return {
          ok: false,
          error: `Unknown crop "${args.crop}". Known crops: ${crops.map((c) => c.name).join(", ")}.`,
        };
    } else if (args.needCrop) {
      return { ok: false, error: "Which crop? Ask the farmer." };
    }
    let market = null;
    if (args.market) {
      market = findMarket(markets, args.market);
      if (!market)
        return {
          ok: false,
          error: `No data for market "${args.market}". Markets with prices: ${markets.map((m) => m.name).join(", ")}.`,
        };
    } else {
      const user = await ctx.db.get("users", args.userId);
      market =
        (user?.marketId ? await ctx.db.get("markets", user.marketId) : null) ?? markets[0] ?? null;
    }
    return {
      ok: true,
      crop: crop ? { id: crop._id, name: crop.name, nameUr: crop.nameUr } : null,
      market: market ? { id: market._id, name: market.name } : null,
    };
  },
});

// ---------------------------------------------------------------------------
// Tools (wrap the same internal queries the REST API uses)
// ---------------------------------------------------------------------------

const UNIT = "Rs per 40 kg (maund)";

function ownerId(ctx: ToolCtx): Id<"users"> {
  if (!ctx.userId) throw new Error("This thread has no owner.");
  return ctx.userId as Id<"users">;
}

async function lookup(
  ctx: ToolCtx,
  input: { crop?: string; market?: string },
  needCrop: boolean,
) {
  return (await ctx.runQuery(internal.assistant.resolve, {
    userId: ownerId(ctx),
    crop: input.crop,
    market: input.market,
    needCrop,
  })) as Resolved;
}

const marketArg = z
  .string()
  .optional()
  .describe("Market or city, e.g. Hyderabad, Sukkur, Mirpur Khas. Omit to use the farmer's own mandi.");
const cropArg = z.string().describe("Crop name in English, e.g. Wheat, Rice, Cotton, Sugarcane, Onion, Tomato, Mango, Banana.");

const getTodayPrices = createTool({
  description: "Today's latest price of every crop in one market, with the change since the previous day.",
  inputSchema: z.object({ market: marketArg }),
  execute: async (ctx, input) => {
    const r = await lookup(ctx, input, false);
    if (!r.ok) return { error: r.error };
    if (!r.market) return { error: "No markets yet." };
    const data = await ctx.runQuery(internal.prices.today, {
      marketId: r.market.id,
      date: todayPK(Date.now()),
    });
    if (!data) return { error: "Market not found." };
    return {
      kind: "prices" as const,
      unit: UNIT,
      market: data.market.name,
      asOf: data.asOf,
      items: data.items.map((i) => ({
        crop: i.crop.name,
        cropUr: i.crop.nameUr,
        icon: i.crop.icon,
        category: i.crop.category,
        price: i.price,
        date: i.date,
        change: i.change,
        changePct: i.changePct,
      })),
    };
  },
});

const getPriceTrend = createTool({
  description: "The last 14 days of one crop's price in one market, with min, max and average.",
  inputSchema: z.object({ crop: cropArg, market: marketArg }),
  execute: async (ctx, input) => {
    const r = await lookup(ctx, input, true);
    if (!r.ok) return { error: r.error };
    if (!r.crop || !r.market) return { error: "Crop or market missing." };
    const data = await ctx.runQuery(internal.prices.history, {
      cropId: r.crop.id,
      marketId: r.market.id,
      date: todayPK(Date.now()),
      days: HISTORY_DAYS,
    });
    if (!data || !data.latest) return { error: `No prices for ${r.crop.name} in ${r.market.name}.` };
    return {
      kind: "trend" as const,
      unit: UNIT,
      crop: data.crop.name,
      cropUr: data.crop.nameUr,
      market: data.market.name,
      latest: data.latest,
      stats: data.stats,
      points: data.points,
    };
  },
});

const compareMarkets = createTool({
  description: "One crop's latest price in every market, best price first. Use for 'where should I sell'.",
  inputSchema: z.object({ crop: cropArg }),
  execute: async (ctx, input) => {
    const r = await lookup(ctx, input, true);
    if (!r.ok) return { error: r.error };
    if (!r.crop) return { error: "Crop missing." };
    const data = await ctx.runQuery(internal.prices.compare, {
      cropId: r.crop.id,
      marketId: r.market?.id,
      date: todayPK(Date.now()),
    });
    return {
      kind: "compare" as const,
      unit: UNIT,
      crop: r.crop.name,
      cropUr: r.crop.nameUr,
      average: data.average,
      markets: data.markets.map((m) => ({
        market: m.market.name,
        district: m.market.district,
        price: m.price,
        date: m.date,
        best: m.best,
        yours: m.selected,
        diffVsYours: m.diffVsSelected,
      })),
    };
  },
});

const searchListings = createTool({
  description: "Active produce listings on the marketplace (farmers selling). Up to 5 results.",
  inputSchema: z.object({
    crop: z.string().optional().describe("Crop name in English."),
    district: z.string().optional().describe("District, e.g. Hyderabad."),
    grade: z.enum(GRADES).optional(),
    sort: z.enum(["newest", "price_asc"]).optional(),
  }),
  execute: async (ctx, input) => {
    const r = await lookup(ctx, { crop: input.crop }, false);
    if (!r.ok) return { error: r.error };
    const items = await ctx.runQuery(internal.listings.search, {
      viewerId: ownerId(ctx),
      date: todayPK(Date.now()),
      cropId: r.crop?.id,
      district: input.district?.trim() || undefined,
      grade: input.grade,
      sort: input.sort ?? "newest",
    });
    return {
      kind: "listings" as const,
      unit: UNIT,
      total: items.length,
      items: items.slice(0, 5).map((l) => ({
        id: l.id,
        crop: l.crop.name,
        icon: l.crop.icon,
        category: l.crop.category,
        quantityMaund: l.quantity,
        askingPrice: l.askingPrice,
        grade: l.grade,
        district: l.district,
        availableFrom: l.availableFrom,
        seller: l.seller?.name ?? null,
        vsMarket: l.market?.label ?? null,
        marketAverage: l.market?.average ?? null,
      })),
    };
  },
});

const getMyAlerts = createTool({
  description: "The farmer's own price alerts and whether each has triggered.",
  inputSchema: z.object({}),
  execute: async (ctx) => {
    const me = (await ctx.runQuery(internal.assistant.profile, { userId: ownerId(ctx) })) as Profile | null;
    if (me?.role !== "farmer") return { error: "Only farmers have price alerts." };
    const data = await ctx.runMutation(internal.alerts.evaluate, {
      userId: ownerId(ctx),
      date: todayPK(Date.now()),
    });
    return {
      kind: "alerts" as const,
      unit: UNIT,
      triggeredCount: data.triggeredCount,
      alerts: data.alerts.map((a) => ({
        crop: a.crop.name,
        market: a.market.name,
        condition: a.condition,
        targetPrice: a.targetPrice,
        latest: a.latest,
        latestDate: a.latestDate,
        status: a.status,
        toGo: a.toGo,
      })),
    };
  },
});

const estimateProfit = createTool({
  description:
    "Profit estimate for selling a quantity of a crop at a market's latest price. quantity in maund (40 kg); costPerUnit in Rs per maund.",
  inputSchema: z.object({
    crop: cropArg,
    market: marketArg,
    quantity: z.number().positive().describe("Maund (40 kg). Convert kg by dividing by 40."),
    costPerUnit: z.number().min(0).describe("Farmer's cost in Rs per maund."),
    priceShiftPct: z.number().min(-20).max(20).optional().describe("What-if change to the price, -20 to 20."),
  }),
  execute: async (ctx, input) => {
    const r = await lookup(ctx, input, true);
    if (!r.ok) return { error: r.error };
    if (!r.crop || !r.market) return { error: "Crop or market missing." };
    const data = await ctx.runQuery(internal.prices.history, {
      cropId: r.crop.id,
      marketId: r.market.id,
      date: todayPK(Date.now()),
      days: 2,
    });
    if (!data?.latest) return { error: `No prices for ${r.crop.name} in ${r.market.name}.` };
    const result = profit({
      qty: input.quantity,
      costPerUnit: input.costPerUnit,
      price: data.latest.price,
      shiftPct: input.priceShiftPct ?? 0,
    });
    return {
      kind: "profit" as const,
      unit: UNIT,
      crop: r.crop.name,
      market: r.market.name,
      priceDate: data.latest.date,
      marketPrice: data.latest.price,
      quantity: input.quantity,
      costPerUnit: input.costPerUnit,
      ...result,
    };
  },
});

const alertInput = z.object({
  crop: cropArg,
  market: marketArg,
  condition: z.enum(["above", "below"]),
  targetPrice: z.number().positive().describe("Rs per 40 kg."),
});

/** Write tool: the app shows a Confirm/Cancel card; it runs only after Confirm. */
const createAlert = createTool({
  description:
    "Create a price alert for the farmer. The farmer must confirm on screen before it is saved; never claim it is set until the tool returns ok.",
  inputSchema: alertInput,
  // Ask for confirmation only for a valid request; otherwise run now so the
  // model gets the error and can ask again.
  needsApproval: async (ctx, input) => {
    const me = (await ctx.runQuery(internal.assistant.profile, { userId: ownerId(ctx) })) as Profile | null;
    if (me?.role !== "farmer") return false;
    const r = await lookup(ctx, input, true);
    return r.ok && !!r.crop && !!r.market;
  },
  execute: async (ctx, input) => {
    const me = (await ctx.runQuery(internal.assistant.profile, { userId: ownerId(ctx) })) as Profile | null;
    if (me?.role !== "farmer") return { ok: false, error: "Only farmers can set price alerts." };
    const r = await lookup(ctx, input, true);
    if (!r.ok) return { ok: false, error: r.error };
    if (!r.crop || !r.market) return { ok: false, error: "Crop or market missing." };
    const alertId = await ctx.runMutation(internal.alerts.create, {
      userId: ownerId(ctx),
      cropId: r.crop.id,
      marketId: r.market.id,
      condition: input.condition,
      targetPrice: Math.round(input.targetPrice),
      active: true,
    });
    return {
      ok: true,
      kind: "alertCreated" as const,
      alertId,
      crop: r.crop.name,
      market: r.market.name,
      condition: input.condition,
      targetPrice: Math.round(input.targetPrice),
    };
  },
});

// Typed loosely: the full tool union is too complex for TypeScript here.
const tools: ToolSet = {
  getTodayPrices,
  getPriceTrend,
  compareMarkets,
  searchListings,
  getMyAlerts,
  estimateProfit,
  createAlert,
};

const BASE_INSTRUCTIONS = `You are "Kisan Dost" (کسان دوست), a friendly assistant inside the KisanMandi app for small farmers and buyers in Sindh, Pakistan.

Scope: crop prices, mandis (markets), when and where to sell, the app's marketplace listings, price alerts, profit estimates and simple practical farming questions. Politely decline anything else in one sentence.

Rules:
- Never invent or guess prices. Get every number from a tool and quote it with its date (e.g. "Rs 3,850 per 40 kg on 21 Oct").
- Prices are Rs per 40 kg (one maund). Convert kg to maund by dividing by 40.
- If a tool returns an error, explain it simply and ask for what's missing. Markets with data are only those the tools know.
- To set an alert, call createAlert. The farmer sees a Confirm/Cancel card; say "Please confirm on the card" and do not claim it is saved until the tool result says ok. If they cancel, accept it.
- Keep replies short (2-5 sentences, or a short list); the app shows a table or chart for tool results, so don't repeat every row. Plain text only: no markdown (no **bold**, tables or headings). Use simple words; many users listen to replies read aloud.
- Do not promise future prices. Advice must be based on the numbers you got.
- Reply in the language and script the user writes in: Urdu script → Urdu, Sindhi → Sindhi, Roman Urdu (Urdu in Latin letters) → Roman Urdu, English → English.`;

function instructionsFor(me: Profile | null, today: string) {
  const lines = [BASE_INSTRUCTIONS, "", `Today in Pakistan: ${today}.`];
  if (me) {
    lines.push(
      `User: ${me.name}, ${me.role ?? "role not set"}${me.district ? `, ${me.district}` : ""}. ` +
        `Default mandi: ${me.marketName ?? "none"}. Profile language: ${LANGUAGE_NAMES[me.language]} (use it when the user's language is unclear).`,
    );
    if (me.role !== "farmer")
      lines.push("This user is a buyer: they cannot create price alerts or listings.");
  }
  return lines.join("\n");
}

// Agent's constructor options type trips TypeScript 6 ("union type too complex"),
// so construct it through a plainly typed signature. Options follow Agent's Config.
type KisanAgent = Agent<object, ToolSet>;
const AgentCtor = Agent as unknown as new (
  component: AgentComponent,
  options: Record<string, unknown>,
) => KisanAgent;

const kisanDost = new AgentCtor(components.agent, {
  name: "Kisan Dost",
  languageModel: assistantModel(),
  instructions: BASE_INSTRUCTIONS,
  tools,
  stopWhen: stepCountIs(6),
  callSettings: { maxOutputTokens: 700, temperature: 0.3 },
  contextOptions: { recentMessages: 24 },
});

// ---------------------------------------------------------------------------
// Threads and messages (called from the REST layer with the caller's user id)
// ---------------------------------------------------------------------------

async function ownThread(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  userId: Id<"users">,
  threadId: string,
) {
  let thread;
  try {
    thread = await getThreadMetadata(ctx, components.agent, { threadId });
  } catch {
    apiError("NOT_FOUND", 404, "Conversation not found.");
  }
  if (!thread || thread.userId !== userId)
    apiError("NOT_FOUND", 404, "Conversation not found.");
  return thread;
}

export const createThread = internalMutation({
  args: { userId: v.id("users"), title: v.optional(v.string()) },
  handler: async (ctx, args): Promise<string> => {
    const { threadId } = await kisanDost.createThread(ctx, {
      userId: args.userId,
      title: args.title ?? "Kisan Dost",
    });
    return threadId;
  },
});

export const listThreads = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const page = await ctx.runQuery(components.agent.threads.listThreadsByUserId, {
      userId: args.userId,
      order: "desc",
      paginationOpts: { cursor: null, numItems: 20 },
    });
    return page.page.map((t) => ({
      id: t._id,
      title: t.title ?? "Kisan Dost",
      createdAt: t._creationTime,
    }));
  },
});

/** Saves the user's text and schedules the reply (streamed into the thread). */
export const sendMessage = internalMutation({
  args: { userId: v.id("users"), threadId: v.string(), text: v.string() },
  handler: async (ctx, args): Promise<{ messageId: string }> => {
    await ownThread(ctx, args.userId, args.threadId);
    await enforceAiLimit(ctx, "assistantMessage", args.userId);
    const { messageId } = await saveMessage(ctx, components.agent, {
      threadId: args.threadId,
      userId: args.userId,
      prompt: args.text,
    });
    await ctx.scheduler.runAfter(0, internal.assistant.generateReply, {
      userId: args.userId,
      threadId: args.threadId,
      promptMessageId: messageId,
    });
    return { messageId };
  },
});

/** Confirm or Cancel on a write-tool card (e.g. "Set alert?"). */
export const respondToProposal = internalMutation({
  args: {
    userId: v.id("users"),
    threadId: v.string(),
    approvalId: v.string(),
    approved: v.boolean(),
  },
  handler: async (ctx, args): Promise<{ messageId: string }> => {
    await ownThread(ctx, args.userId, args.threadId);
    await enforceAiLimit(ctx, "assistantMessage", args.userId);
    let messageId: string;
    try {
      ({ messageId } = args.approved
        ? await kisanDost.approveToolCall(ctx, {
            threadId: args.threadId,
            approvalId: args.approvalId,
          })
        : await kisanDost.denyToolCall(ctx, {
            threadId: args.threadId,
            approvalId: args.approvalId,
            reason: "The farmer tapped Cancel.",
          }));
    } catch (e) {
      console.warn("Kisan Dost: approval failed", e instanceof Error ? e.message : e);
      apiError("ALREADY_ANSWERED", 409, "This card was already answered.");
    }
    await ctx.scheduler.runAfter(0, internal.assistant.generateReply, {
      userId: args.userId,
      threadId: args.threadId,
      promptMessageId: messageId,
    });
    return { messageId };
  },
});

/** Runs the model with tools and streams the reply into the thread. */
export const generateReply = internalAction({
  args: { userId: v.id("users"), threadId: v.string(), promptMessageId: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const me = (await ctx.runQuery(internal.assistant.profile, { userId: args.userId })) as Profile | null;
    try {
      const result = await kisanDost.streamText(
        ctx,
        { threadId: args.threadId, userId: args.userId },
        {
          promptMessageId: args.promptMessageId,
          instructions: instructionsFor(me, todayPK(Date.now())),
        },
        { saveStreamDeltas: { chunking: "word", throttleMs: 150 } },
      );
      await result.consumeStream();
    } catch (e) {
      // The agent marks the pending reply as failed; the app shows a retry note.
      console.error("Kisan Dost reply failed", e instanceof Error ? e.message : e);
    }
    return null;
  },
});

/** Simplified history for `GET /assistant/threads/:id`. */
export const threadView = internalQuery({
  args: { userId: v.id("users"), threadId: v.string() },
  handler: async (ctx, args) => {
    const thread = await ownThread(ctx, args.userId, args.threadId);
    const page = await listUIMessages(ctx, components.agent, {
      threadId: args.threadId,
      paginationOpts: { cursor: null, numItems: 50 },
    });
    return {
      thread: { id: thread._id, title: thread.title ?? "Kisan Dost", createdAt: thread._creationTime },
      // Oldest first, like a chat.
      messages: [...page.page]
        .sort((a, b) => a.order - b.order || a.stepOrder - b.stepOrder)
        .map((m) => ({
          id: m.id,
          role: m.role,
          status: m.status,
          text: m.text,
          createdAt: m._creationTime,
          parts: m.parts,
        })),
    };
  },
});

/**
 * Live thread for the chat screen (useUIMessages from @convex-dev/agent/react).
 * Only the thread owner can read it.
 */
export const listThreadMessages = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await ownThread(ctx, user._id, args.threadId);
    const paginated = await listUIMessages(ctx, components.agent, args);
    const streams = await syncStreams(ctx, components.agent, args);
    return { ...paginated, streams };
  },
});
