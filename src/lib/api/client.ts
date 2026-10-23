import { CONVEX_SITE_URL } from "@/lib/config";
import { fetchConvexToken } from "@/providers/auth-provider";
import { apiSession, tokenCache } from "./token-cache";

// KisanMandi REST API (convex/rest/routes.ts) on the Convex HTTP host.
const BASE = `${CONVEX_SITE_URL}/api/v1`;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

function expiryOf(token: string) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

async function getToken(force = false) {
  // Reuse the Convex JWT for this session until a minute before it expires.
  const sessionId = apiSession();
  const hit = force ? null : tokenCache.get(sessionId);
  if (hit) return hit;
  const token = await fetchConvexToken();
  if (token && sessionId) tokenCache.set(token, expiryOf(token), sessionId);
  else tokenCache.clear();
  return token;
}

async function request<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
  const token = await getToken(retried);
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Couldn't connect. Check your internet and try again.");
  }
  // A just-expired token: fetch a fresh one once.
  if (response.status === 401 && !retried) return request<T>(method, path, body, true);
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error =
      data && typeof data === "object" && "error" in data
        ? (data.error as { code?: string; message?: string; field?: string })
        : {};
    throw new ApiError(
      response.status,
      error.code ?? "SERVER_ERROR",
      error.message ?? "Something went wrong.",
      error.field,
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};
