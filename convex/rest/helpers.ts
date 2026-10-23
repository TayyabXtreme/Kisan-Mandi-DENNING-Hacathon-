import { ConvexError } from "convex/values";
import type { HttpRouter } from "convex/server";
import type { z } from "zod";
import { internal } from "../_generated/api";
import type { Id, TableNames } from "../_generated/dataModel";
import { httpAction, type ActionCtx } from "../_generated/server";
import { isApiErrorData } from "../lib/errors";
import { todayPK } from "../lib/kisan";
import type { UserView } from "../users";

export const API = "/api/v1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

export const fail = (status: number, code: string, message = code, field?: string) =>
  new HttpError(status, code, message, field);

type Access = "public" | "user" | "profile" | "farmer" | "admin";

export type RouteCtx = {
  ctx: ActionCtx;
  req: Request;
  url: URL;
  /** Pakistan date the request is evaluated on. */
  today: string;
  user: UserView;
  /** Last path segment, for `/collection/:id` routes. */
  id: string;
};

type Handler = (r: RouteCtx) => Promise<unknown>;

async function resolveUser(ctx: ActionCtx, access: Access) {
  if (access === "public") return null;
  const user: UserView | null = await ctx.runQuery(internal.users.apiUser, {});
  if (!user) throw fail(401, "UNAUTHENTICATED", "Sign in to continue.");
  if (access === "user") return user;
  if (!user.role)
    throw fail(403, "PROFILE_INCOMPLETE", "Finish your profile first.");
  if (access === "farmer" && user.role !== "farmer")
    throw fail(403, "FARMERS_ONLY", "Only farmers can do this.");
  if (access === "admin" && !user.isAdmin)
    throw fail(403, "ADMINS_ONLY", "Only the admin can do this.");
  return user;
}

function toResponse(error: unknown) {
  if (error instanceof HttpError)
    return json(
      { error: { code: error.code, message: error.message, field: error.field } },
      error.status,
    );
  if (error instanceof ConvexError && isApiErrorData(error.data))
    return json(
      { error: { code: error.data.code, message: error.data.message } },
      error.data.status,
    );
  const message = error instanceof Error ? error.message : String(error);
  // A malformed id in the URL fails argument validation in the called function.
  if (/ArgumentValidationError|Value does not match validator|Invalid ID/i.test(message))
    return json({ error: { code: "BAD_REQUEST", message: "Invalid id or parameter." } }, 400);
  console.error("REST handler failed", message);
  return json({ error: { code: "SERVER_ERROR", message: "Something went wrong." } }, 500);
}

function wrap(access: Access, handler: Handler) {
  return httpAction(async (ctx, req) => {
    try {
      const url = new URL(req.url);
      const user = (await resolveUser(ctx, access)) as UserView;
      const id = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "");
      const result = await handler({ ctx, req, url, today: todayPK(Date.now()), user, id });
      return result instanceof Response ? result : json(result ?? { ok: true });
    } catch (error) {
      return toResponse(error);
    }
  });
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

/** Registers `path` (exact) or `path/` + `*` (prefix, for ids). */
export function route(
  http: HttpRouter,
  method: Method,
  path: string,
  access: Access,
  handler: Handler,
) {
  const action = wrap(access, handler);
  if (path.endsWith("/*"))
    http.route({ pathPrefix: path.slice(0, -1), method, handler: action });
  else http.route({ path, method, handler: action });
}

/** Answers CORS preflight for every API path (web build). */
export function registerCors(http: HttpRouter) {
  http.route({
    pathPrefix: `${API}/`,
    method: "OPTIONS",
    handler: httpAction(async () => new Response(null, { status: 204, headers: CORS })),
  });
}

export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.output<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw fail(400, "INVALID_JSON", "Send a JSON body.");
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue?.path.map(String).join(".") || undefined;
    // Schema messages are error codes (e.g. QTY_POSITIVE) the app translates.
    const code = issue && /^[A-Z_]+$/.test(issue.message) ? issue.message : "VALIDATION_FAILED";
    throw fail(400, code, issue?.message ?? "Invalid body.", field);
  }
  return result.data;
}

/** Query-string id; the called function's validator rejects malformed ones. */
export function idParam<T extends TableNames>(url: URL, name: string, required: true): Id<T>;
export function idParam<T extends TableNames>(url: URL, name: string, required?: false): Id<T> | undefined;
export function idParam<T extends TableNames>(url: URL, name: string, required = false) {
  const value = url.searchParams.get(name)?.trim();
  if (!value) {
    if (required) throw fail(400, "MISSING_PARAM", `Pass ${name}.`, name);
    return undefined;
  }
  return value as Id<T>;
}

export const asId = <T extends TableNames>(value: string) => value as Id<T>;
