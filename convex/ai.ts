"use node";

import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createGroq } from "@ai-sdk/groq";
import { generateText, Output } from "ai";
import { ConvexError, v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import { action, env, internalAction, type ActionCtx } from "./_generated/server";
import { enforceAiLimit, type AiLimit } from "./assistant_limits";
import { CROP_ALIASES_HINT, DISTRICTS, GRADES } from "./lib/kisan";
import { transcribeAudio, TranscriptionError } from "./lib/transcription";

// Check https://console.groq.com/docs/models and your Bedrock model access
// page; override either default with the GROQ_MODEL / BEDROCK_MODEL_ID env vars.
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
const DEFAULT_BEDROCK_MODEL = "us.anthropic.claude-sonnet-4-6";

// Fast, cheap model for structured app features (advice, form parsing).
const DEFAULT_FAST_BEDROCK_MODEL = "us.anthropic.claude-haiku-4-5-20251001-v1:0";

function getModel(provider: "groq" | "bedrock", modelId?: string) {
  if (provider === "groq") {
    if (!env.GROQ_API_KEY) throw new Error("Set GROQ_API_KEY in Convex.");
    return createGroq({ apiKey: env.GROQ_API_KEY })(
      env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL,
    );
  }
  if (
    !env.AWS_BEARER_TOKEN_BEDROCK &&
    !(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY)
  )
    throw new Error(
      "Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (or AWS_BEARER_TOKEN_BEDROCK) in Convex.",
    );
  const bedrock = createAmazonBedrock({
    region: env.AWS_REGION ?? "us-east-1",
    ...(env.AWS_BEARER_TOKEN_BEDROCK
      ? { apiKey: env.AWS_BEARER_TOKEN_BEDROCK }
      : {
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        }),
  });
  return bedrock(modelId ?? env.BEDROCK_MODEL_ID ?? DEFAULT_BEDROCK_MODEL);
}

/** Per-user AI quota (R7). Skipped for CLI/internal calls without a signed-in user. */
async function limitCaller(ctx: ActionCtx, name: AiLimit) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity) await enforceAiLimit(ctx, name, identity.tokenIdentifier);
}

/** Speech to text with Groq Whisper. Send the recording's bytes and MIME type. */
export const transcribe = action({
  args: {
    audio: v.bytes(),
    mimeType: v.string(),
    language: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<string> => {
    if (!(await ctx.auth.getUserIdentity()))
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Sign in to use voice input." });
    if (!env.GROQ_API_KEY)
      throw new ConvexError({ code: "TRANSCRIPTION_CONFIG", message: "Voice transcription isn't configured yet." });
    await limitCaller(ctx, "aiTranscribe");
    try {
      return await transcribeAudio({
        ...args,
        apiKey: env.GROQ_API_KEY,
        model: env.GROQ_WHISPER_MODEL,
      });
    } catch (error) {
      if (error instanceof TranscriptionError)
        throw new ConvexError({ code: error.code, message: error.message });
      throw error;
    }
  },
});

/** Chat with Groq or AWS Bedrock. Keys stay on the server; signed-in users only. */
export const chat = action({
  args: {
    provider: v.union(v.literal("groq"), v.literal("bedrock")),
    system: v.optional(v.string()),
    messages: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
      }),
    ),
  },
  handler: async (ctx, args): Promise<string> => {
    if (!(await ctx.auth.getUserIdentity()))
      throw new Error("Sign in to use AI.");
    if (args.messages.length === 0 || args.messages.length > 50)
      throw new Error("Send between 1 and 50 messages.");
    const { text } = await generateText({
      model: getModel(args.provider),
      system: args.system,
      messages: args.messages,
      maxOutputTokens: 1024,
    });
    return text;
  },
});

const LANGUAGE_NAMES = { en: "English", ur: "Urdu (Urdu script)", sd: "Sindhi (Arabic script)" };

const adviceSchema = z.object({
  verdict: z.enum(["sell_now", "wait", "sell_elsewhere"]),
  headline: z.string().max(140),
  reasons: z.array(z.string().max(200)).max(3),
  bestMarket: z.string(),
});

/** "Should I sell now?" for one crop and market, cached per day and language. */
export const priceAdvice = internalAction({
  args: {
    cropId: v.id("crops"),
    marketId: v.id("markets"),
    date: v.string(),
    language: v.union(v.literal("en"), v.literal("ur"), v.literal("sd")),
  },
  handler: async (ctx, args): Promise<z.infer<typeof adviceSchema>> => {
    const key = `${args.cropId}|${args.marketId}|${args.date}|${args.language}`;
    const cached = await ctx.runQuery(internal.advice.getCached, { key });
    if (cached) return cached;
    await limitCaller(ctx, "aiAdvice");
    // language only shapes the prompt and cache key; the query takes the rest.
    const data = await ctx.runQuery(internal.prices.adviceContext, {
      cropId: args.cropId,
      marketId: args.marketId,
      date: args.date,
    });
    if (!data || data.series.length === 0) throw new Error("No price data for this crop.");
    const { output } = await generateText({
      model: getModel("bedrock", DEFAULT_FAST_BEDROCK_MODEL),
      output: Output.object({ schema: adviceSchema }),
      maxOutputTokens: 600,
      system:
        "You advise small farmers in Sindh, Pakistan on when and where to sell. Prices are Rs per 40 kg (maund). " +
        "Be practical and brief; base every claim only on the numbers given. Do not promise future prices. " +
        `Write headline and reasons in ${LANGUAGE_NAMES[args.language]}. Keep bestMarket as the market's English name.`,
      prompt: JSON.stringify({
        crop: data.crop,
        farmerMarket: data.market,
        last14Days: data.series,
        todayAcrossMarkets: data.markets,
      }),
    });
    await ctx.runMutation(internal.advice.saveCached, { key, advice: output });
    return output;
  },
});

const parsedListingSchema = z.object({
  crop: z.string().nullable(),
  quantity: z.number().nullable(),
  askingPrice: z.number().nullable(),
  grade: z.enum(GRADES).nullable(),
  district: z.enum(DISTRICTS).nullable(),
  availableFrom: z.string().nullable(),
});

/** Turns a spoken description (any of en/ur/sd) into Sell-form fields. */
export const parseListing = internalAction({
  args: { text: v.string(), today: v.string() },
  handler: async (ctx, args): Promise<z.infer<typeof parsedListingSchema>> => {
    await limitCaller(ctx, "aiParseListing");
    const { output } = await generateText({
      model: getModel("bedrock", DEFAULT_FAST_BEDROCK_MODEL),
      output: Output.object({ schema: parsedListingSchema }),
      maxOutputTokens: 300,
      system:
        "Extract a produce listing from a farmer's words (English, Urdu or Sindhi). " +
        `crop must be one of: ${CROP_ALIASES_HINT}; answer with the English name. ` +
        "quantity is in maund (40 kg); convert kg to maund. askingPrice is Rs per 40 kg. " +
        `availableFrom is YYYY-MM-DD; today is ${args.today}; resolve words like "tomorrow" or "next week". ` +
        "Use null for anything not said.",
      prompt: args.text,
    });
    return output;
  },
});
