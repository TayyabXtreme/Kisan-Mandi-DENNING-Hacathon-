// Response shapes of the KisanMandi REST API (convex/rest/routes.ts).
// Keep in sync with the *View helpers in convex/prices.ts, alerts.ts, listings.ts.
import type {
  Category,
  Condition,
  District,
  ExpenseCategory,
  Grade,
  Lang,
  MarketLabel,
  Role,
  SupportTopic,
} from "../../../convex/lib/kisan";

/** GET/PATCH /users/me */
export type Me = {
  /** Can add markets and review market requests. */
  isAdmin: boolean;
  id: string;
  name: string;
  email: string;
  image: string | null;
  authId: string;
  phone: string | null;
  district: District | null;
  role: Role | null;
  language: Lang;
  marketId: string | null;
  emailAlerts: boolean;
};

export type Crop = {
  id: string;
  name: string;
  nameUr: string;
  nameSd: string;
  category: Category;
  /** wheat | rice | cotton | sugarcane | onion | tomato | mango | banana */
  icon: string;
};

export type Market = {
  id: string;
  name: string;
  nameUr: string;
  nameSd: string;
  district: string;
};

/** GET /crops, GET /markets */
export type ListResponse<T> = { items: T[] };

/** GET /market-requests: every pending one for the admin, else the caller's own. */
export type MarketRequest = {
  id: string;
  name: string;
  nameUr: string;
  district: string;
  note: string;
  status: "pending" | "approved" | "rejected";
  marketId: string | null;
  createdAt: number;
  requester: {
    name: string;
    role: Role | null;
    phone: string | null;
    district: string | null;
  } | null;
};

/** GET /support: every open message for the admin, else the caller's own. */
export type SupportMessage = {
  id: string;
  topic: SupportTopic;
  message: string;
  status: "open" | "done";
  createdAt: number;
  sender: {
    name: string;
    role: Role | null;
    phone: string | null;
    district: string | null;
    email: string | null;
  } | null;
};

/** GET/POST /mcp-key: the user's ChatGPT / Claude link (never the secret). */
export type McpKeyStatus = { prefix: string; createdAt: number; lastUsedAt: number | null };

/** POST /market-requests */
export type MarketRequestResult =
  | { status: "exists"; marketId: string }
  | { status: "pending"; id: string };

/** GET /prices?marketId&q&category — Rs per 40 kg */
export type PriceRow = {
  crop: Crop;
  price: number;
  previous: number | null;
  /** YYYY-MM-DD of `price` */
  date: string;
  change: number;
  changePct: number;
};
export type PricesResponse = {
  market: Market;
  /** Latest price date in this market (may lag `today` if the cron is late). */
  asOf: string | null;
  today: string;
  items: PriceRow[];
  /** Set when the admin entered the latest prices (not auto-generated). */
  publishedBy: { name: string; date: string } | null;
};

/** GET /prices/history?cropId&marketId&days=14 */
export type PricePoint = { date: string; price: number };
export type HistoryResponse = {
  crop: Crop;
  market: Market;
  points: PricePoint[];
  stats: { min: PricePoint; max: PricePoint; avg: number; days: number } | null;
  latest: { price: number; date: string; change: number; changePct: number } | null;
};

/** GET /prices/compare?cropId&marketId — best price first */
export type CompareRow = {
  rank: number;
  market: Market;
  price: number;
  date: string;
  best: boolean;
  selected: boolean;
  /** price − selected market's price; null when no market is selected */
  diffVsSelected: number | null;
};
export type CompareResponse = { average: number | null; markets: CompareRow[] };

/** GET /alerts — re-evaluated on every request */
export type AlertStatus = "triggered" | "waiting" | "paused";
export type Alert = {
  id: string;
  crop: Crop;
  market: Market;
  condition: Condition;
  targetPrice: number;
  active: boolean;
  latest: number | null;
  latestDate: string | null;
  status: AlertStatus;
  /** Rs still needed to trigger; 0 when triggered; null when no price */
  toGo: number | null;
};
export type AlertsResponse = { alerts: Alert[]; triggeredCount: number };

/** POST /alerts, PATCH /alerts/:id body */
export type AlertBody = {
  cropId: string;
  marketId: string;
  condition: Condition;
  targetPrice: number;
  active: boolean;
};

export type ListingMarket = {
  /** Average of today's price across all markets */
  average: number;
  markets: number;
  label: MarketLabel;
  diff: number;
  diffPct: number;
};

/** GET /listings, GET /listings/mine items */
export type Listing = {
  id: string;
  crop: Crop;
  /** maund */
  quantity: number;
  /** Rs per 40 kg */
  askingPrice: number;
  district: District;
  grade: Grade;
  availableFrom: string;
  /** +92XXXXXXXXXX */
  contactPhone: string;
  status: "active" | "sold";
  createdAt: number;
  updatedAt: number;
  isOwner: boolean;
  seller: { id: string; name: string; role: Role } | null;
  market: ListingMarket | null;
};
export type ListingsResponse = { items: Listing[]; count: number };
export type MyListingsResponse = {
  items: Listing[];
  counts: { active: number; sold: number };
};

/** GET /listings/:id */
export type ListingDetail = Omit<Listing, "seller"> & {
  seller: {
    id: string;
    name: string;
    role: Role;
    district: string | null;
    authId: string;
    image: string | null;
  } | null;
};

/** POST /listings, PATCH /listings/:id body (phone without +92) */
export type ListingBody = {
  cropId: string;
  quantity: number;
  askingPrice: number;
  district: District;
  grade: Grade;
  availableFrom: string;
  contactPhone: string;
};

/** POST /ai/advice */
export type Advice = {
  verdict: "sell_now" | "wait" | "sell_elsewhere";
  headline: string;
  reasons: string[];
  bestMarket: string;
};

// ---- Buyer <-> farmer chat (docs/plan.md §7) ----
// Chat screens read through reactive Convex queries, so these come straight
// from the query return types in convex/conversations.ts and messages.ts.
type ChatApi = typeof import("../../../convex/_generated/api").api;
type Returns<F> = import("convex/server").FunctionReturnType<
  F extends import("convex/server").FunctionReference<"query"> ? F : never
>;

/** api.conversations.list rows (Chats tab). */
export type ChatRow = Returns<ChatApi["conversations"]["list"]>[number];
/** api.conversations.get (chat header + pinned listing). */
export type ChatDetail = NonNullable<Returns<ChatApi["conversations"]["get"]>>;
/** api.messages.list page items. */
export type ChatMessage = Returns<ChatApi["messages"]["list"]>["page"][number];

/** POST /conversations/:id/messages body */
export type SendMessageBody =
  | { type: "text"; body: string }
  | { type: "image"; storageId: string; body?: string }
  | { type: "voice"; storageId: string; durationMs: number }
  | { type: "offer"; price: number; quantity: number; body?: string };

/** GET /conversations/counts — chats per listing id */
export type ChatCountsResponse = { counts: Record<string, number> };

// ---- Dashboard & crop expenses ----
type Internal = typeof import("../../../convex/_generated/api").internal;
type InternalReturns<F> = import("convex/server").FunctionReturnType<
  F extends import("convex/server").FunctionReference<"query", "internal"> ? F : never
>;

/** GET /dashboard for a farmer (convex/dashboard.ts → farmer). */
export type FarmerDashboard = InternalReturns<Internal["dashboard"]["farmer"]>;
/** GET /dashboard for a buyer (convex/dashboard.ts → buyer). */
export type BuyerDashboard = InternalReturns<Internal["dashboard"]["buyer"]>;
export type DashboardResponse = FarmerDashboard | BuyerDashboard;
/** An offer waiting for an answer in one of my chats. */
export type OpenOffer = FarmerDashboard["offers"][number];

/** GET /expenses?cropId */
export type Expense = {
  id: string;
  crop: Crop;
  category: ExpenseCategory;
  /** Rs */
  amount: number;
  note: string | null;
  /** YYYY-MM-DD */
  date: string;
  createdAt: number;
};
export type ExpensesResponse = { items: Expense[]; total: number };

/** POST /expenses, PATCH /expenses/:id body */
export type ExpenseBody = {
  cropId: string;
  category: ExpenseCategory;
  amount: number;
  note?: string;
  date: string;
};

/** GET /weather?district — Open-Meteo 7-day forecast + farm warnings (convex/weather.ts). */
export type WeatherResponse = import("../../../convex/weather").WeatherData;
export type WeatherWarning = WeatherResponse["warnings"][number];
