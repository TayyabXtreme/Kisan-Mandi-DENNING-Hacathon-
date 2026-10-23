import { useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { create } from "zustand";
import { api, ApiError } from "./client";
import { onApiSessionChange } from "./token-cache";
import type { AlertsResponse, Crop, ListResponse, Market, Me } from "./types";

type Entry = {
  data?: unknown;
  error?: ApiError;
  /** First load, nothing to show yet. */
  loading: boolean;
  /** User pulled to refresh. */
  refreshing: boolean;
  updatedAt?: number;
};

const useStore = create<{ entries: Record<string, Entry> }>(() => ({
  entries: {},
}));

const patch = (path: string, next: Partial<Entry>) =>
  useStore.setState((s) => ({
    entries: {
      ...s.entries,
      [path]: { ...(s.entries[path] ?? { loading: false, refreshing: false }), ...next },
    },
  }));

const inflight = new Map<string, Promise<void>>();

/**
 * Fetches `path` into the cache. "refresh" shows the pull-to-refresh spinner;
 * "background" keeps the current data on screen while it updates.
 */
export function load(path: string, mode: "initial" | "refresh" | "background" = "background") {
  const running = inflight.get(path);
  if (running && mode !== "refresh") return running;
  const has = useStore.getState().entries[path]?.data !== undefined;
  patch(path, {
    loading: !has,
    refreshing: mode === "refresh",
    ...(has ? {} : { error: undefined }),
  });
  const promise = api
    .get<unknown>(path)
    .then((data) => patch(path, { data, error: undefined, updatedAt: Date.now() }))
    .catch((e: unknown) =>
      patch(path, {
        error: e instanceof ApiError ? e : new ApiError(0, "UNKNOWN", String(e)),
      }),
    )
    .finally(() => {
      patch(path, { loading: false, refreshing: false });
      if (inflight.get(path) === promise) inflight.delete(path);
    });
  inflight.set(path, promise);
  return promise;
}

/** Refetches every cached path that starts with one of `prefixes` (after a write). */
export function invalidate(...prefixes: string[]) {
  const keys = Object.keys(useStore.getState().entries);
  return Promise.all(
    keys
      .filter((k) => prefixes.some((p) => k.startsWith(p)))
      .map((k) => load(k, "background")),
  );
}

/** Drops cached data for `prefixes` without refetching (e.g. after delete). */
export function forget(...prefixes: string[]) {
  useStore.setState((s) => ({
    entries: Object.fromEntries(
      Object.entries(s.entries).filter(([k]) => !prefixes.some((p) => k.startsWith(p))),
    ),
  }));
}

// A different account must never see the previous account's data.
onApiSessionChange(() => useStore.setState({ entries: {} }));

/**
 * Reads a REST resource with caching. Loads on first use, refetches in the
 * background whenever the screen regains focus. Pass null to skip.
 *
 * const { data, error, loading, refreshing, refresh } = useResource<PricesResponse>(`/prices?marketId=${id}`);
 * <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
 */
export function useResource<T>(path: string | null) {
  const entry = useStore((s) => (path ? s.entries[path] : undefined));
  useFocusEffect(
    useCallback(() => {
      if (path) void load(path, useStore.getState().entries[path]?.data !== undefined ? "background" : "initial");
    }, [path]),
  );
  const refresh = useCallback(async () => {
    if (path) await load(path, "refresh");
  }, [path]);
  return {
    data: entry?.data as T | undefined,
    error: entry?.error,
    loading: !!path && (entry ? entry.loading && entry.data === undefined : true),
    refreshing: entry?.refreshing ?? false,
    updatedAt: entry?.updatedAt,
    refresh,
  };
}

// ---- shared typed hooks ----

export const useMe = () => useResource<Me>("/users/me");
export const useCrops = () => useResource<ListResponse<Crop>>("/crops");
export const useMarkets = () => useResource<ListResponse<Market>>("/markets");

/** Evaluated alerts and the tab badge count. Farmers only (pass false to skip). */
export const useAlerts = (enabled = true) =>
  useResource<AlertsResponse>(enabled ? "/alerts" : null);

/** Builds `/path?a=1&b=2`, skipping empty values. */
export function withQuery(path: string, params: Record<string, string | number | undefined | null>) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return qs ? `${path}?${qs}` : path;
}
