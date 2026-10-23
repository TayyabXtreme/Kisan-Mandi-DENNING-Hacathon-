import Constants from "expo-constants";

// Public app config from app.json → "extra" (bundled into the app, so never
// put secrets here; server secrets live in Convex: `npx convex env list`).
const extra = (Constants.expoConfig?.extra ?? {}) as {
  convexUrl?: string;
  convexSiteUrl?: string;
};

/** Convex deployment URL (…convex.cloud): queries, mutations, auth tokens. */
export const CONVEX_URL = extra.convexUrl ?? "";
/** Convex HTTP actions URL (…convex.site): REST API and Better Auth. */
export const CONVEX_SITE_URL = extra.convexSiteUrl ?? "";
