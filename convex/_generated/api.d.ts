/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as admin from "../admin.js";
import type * as advice from "../advice.js";
import type * as ai from "../ai.js";
import type * as alerts from "../alerts.js";
import type * as assistant from "../assistant.js";
import type * as assistant_limits from "../assistant_limits.js";
import type * as auth from "../auth.js";
import type * as auth_limits from "../auth_limits.js";
import type * as conversations from "../conversations.js";
import type * as crons from "../crons.js";
import type * as crops from "../crops.js";
import type * as email from "../email.js";
import type * as http from "../http.js";
import type * as lib_admin from "../lib/admin.js";
import type * as lib_app_info from "../lib/app_info.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_kisan from "../lib/kisan.js";
import type * as lib_transcription from "../lib/transcription.js";
import type * as listings from "../listings.js";
import type * as markets from "../markets.js";
import type * as mcp_keys from "../mcp_keys.js";
import type * as messages from "../messages.js";
import type * as prices from "../prices.js";
import type * as rest_assistant_routes from "../rest/assistant_routes.js";
import type * as rest_chat_routes from "../rest/chat_routes.js";
import type * as rest_helpers from "../rest/helpers.js";
import type * as rest_mcp from "../rest/mcp.js";
import type * as rest_routes from "../rest/routes.js";
import type * as seed from "../seed.js";
import type * as support from "../support.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  admin: typeof admin;
  advice: typeof advice;
  ai: typeof ai;
  alerts: typeof alerts;
  assistant: typeof assistant;
  assistant_limits: typeof assistant_limits;
  auth: typeof auth;
  auth_limits: typeof auth_limits;
  conversations: typeof conversations;
  crons: typeof crons;
  crops: typeof crops;
  email: typeof email;
  http: typeof http;
  "lib/admin": typeof lib_admin;
  "lib/app_info": typeof lib_app_info;
  "lib/errors": typeof lib_errors;
  "lib/kisan": typeof lib_kisan;
  "lib/transcription": typeof lib_transcription;
  listings: typeof listings;
  markets: typeof markets;
  mcp_keys: typeof mcp_keys;
  messages: typeof messages;
  prices: typeof prices;
  "rest/assistant_routes": typeof rest_assistant_routes;
  "rest/chat_routes": typeof rest_chat_routes;
  "rest/helpers": typeof rest_helpers;
  "rest/mcp": typeof rest_mcp;
  "rest/routes": typeof rest_routes;
  seed: typeof seed;
  support: typeof support;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
