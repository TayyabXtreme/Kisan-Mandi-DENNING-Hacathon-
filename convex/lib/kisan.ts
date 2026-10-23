// Shared by the app and the Convex backend: domain constants, pure maths and
// the zod schemas both sides validate with. No Convex imports here.
import { z } from "zod";

export const CATEGORIES = ["grain", "cash", "vegetable", "fruit"] as const;
export const GRADES = ["A", "B", "C"] as const;
export const ROLES = ["farmer", "buyer"] as const;
export const LANGS = ["en", "ur", "sd"] as const;
export const CONDITIONS = ["above", "below"] as const;
/** Sindh mandi districts, shown first in pickers and as marketplace filter chips. */
export const FEATURED_DISTRICTS = [
  "Hyderabad",
  "Sukkur",
  "Mirpur Khas",
  "Karachi",
  "Larkana",
  "Nawabshah",
  "Thatta",
  "Badin",
] as const;

/** Districts and major cities of Pakistan, by province (searchable in pickers). */
export const DISTRICTS_BY_PROVINCE = {
  Sindh: [
    "Karachi", "Hyderabad", "Sukkur", "Larkana", "Mirpur Khas", "Nawabshah",
    "Thatta", "Badin", "Dadu", "Jacobabad", "Khairpur", "Shikarpur", "Ghotki",
    "Sanghar", "Umerkot", "Tharparkar", "Jamshoro", "Matiari", "Tando Allahyar",
    "Tando Muhammad Khan", "Naushahro Feroze", "Kashmore", "Kambar Shahdadkot",
    "Sujawal",
  ],
  Punjab: [
    "Lahore", "Faisalabad", "Rawalpindi", "Multan", "Gujranwala", "Sialkot",
    "Bahawalpur", "Sargodha", "Sahiwal", "Sheikhupura", "Rahim Yar Khan",
    "Jhang", "Dera Ghazi Khan", "Gujrat", "Kasur", "Okara", "Mianwali",
    "Bahawalnagar", "Muzaffargarh", "Khanewal", "Vehari", "Pakpattan",
    "Hafizabad", "Narowal", "Chiniot", "Toba Tek Singh", "Jhelum", "Chakwal",
    "Attock", "Khushab", "Bhakkar", "Layyah", "Lodhran", "Mandi Bahauddin",
    "Nankana Sahib", "Rajanpur", "Talagang", "Murree",
  ],
  "Khyber Pakhtunkhwa": [
    "Peshawar", "Mardan", "Abbottabad", "Swat", "Kohat", "Bannu",
    "Dera Ismail Khan", "Charsadda", "Nowshera", "Mansehra", "Swabi",
    "Haripur", "Chitral", "Dir", "Malakand", "Buner", "Karak", "Lakki Marwat",
    "Hangu", "Tank", "Battagram", "Shangla", "Khyber", "Bajaur", "Kurram",
  ],
  Balochistan: [
    "Quetta", "Gwadar", "Turbat", "Khuzdar", "Sibi", "Zhob", "Loralai",
    "Chaman", "Nasirabad", "Jaffarabad", "Lasbela", "Hub", "Mastung",
    "Kalat", "Kharan", "Panjgur", "Pishin", "Dera Bugti", "Kohlu", "Nushki",
  ],
  Islamabad: ["Islamabad"],
  "Gilgit-Baltistan": ["Gilgit", "Skardu", "Hunza", "Ghizer", "Ghanche", "Diamer"],
  "Azad Kashmir": ["Muzaffarabad", "Mirpur", "Kotli", "Bagh", "Rawalakot", "Bhimber", "Neelum"],
} as const;

export type Province = keyof typeof DISTRICTS_BY_PROVINCE;
export type District = (typeof DISTRICTS_BY_PROVINCE)[Province][number];

/** Every district/city, unique, Sindh first. */
export const DISTRICTS = Array.from(
  new Set(Object.values(DISTRICTS_BY_PROVINCE).flat()),
) as unknown as readonly [District, ...District[]];

export const provinceOf = (district: string): Province | undefined =>
  (Object.keys(DISTRICTS_BY_PROVINCE) as Province[]).find((p) =>
    (DISTRICTS_BY_PROVINCE[p] as readonly string[]).includes(district),
  );

export type Category = (typeof CATEGORIES)[number];
export type Grade = (typeof GRADES)[number];
export type Role = (typeof ROLES)[number];
export type Lang = (typeof LANGS)[number];
export type Condition = (typeof CONDITIONS)[number];
export type MarketLabel = "below" | "at" | "above";

/** Listings within this share of the cross-market average count as "at market". */
export const AT_MARKET_BAND = 0.05;
export const HISTORY_DAYS = 14;
export const WHAT_IF_RANGE = 20;

// Pakistan Standard Time is UTC+5 with no daylight saving.
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Today's date in Pakistan as YYYY-MM-DD. */
export function todayPK(nowMs: number): string {
  return new Date(nowMs + PKT_OFFSET_MS).toISOString().slice(0, 10);
}

/** Adds whole days to a YYYY-MM-DD key. */
export function addDays(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

export function priceChange(today: number, yesterday: number | null) {
  if (yesterday === null || yesterday === 0) return { amount: 0, pct: 0 };
  const amount = today - yesterday;
  return { amount, pct: round1((amount / yesterday) * 100) };
}

export function marketLabel(asking: number, avg: number): MarketLabel {
  if (avg <= 0) return "at";
  const diff = (asking - avg) / avg;
  // Round away float noise so exactly ±5% stays "at market".
  const rounded = Math.round(diff * 1e6) / 1e6;
  if (rounded < -AT_MARKET_BAND) return "below";
  if (rounded > AT_MARKET_BAND) return "above";
  return "at";
}

export function evaluateAlert(
  condition: Condition,
  target: number,
  latest: number | null,
) {
  if (latest === null) return { triggered: false, toGo: null };
  const triggered = condition === "above" ? latest >= target : latest <= target;
  return { triggered, toGo: triggered ? 0 : Math.abs(target - latest) };
}

export function profit(input: {
  qty: number;
  costPerUnit: number;
  price: number;
  shiftPct: number;
}) {
  const qty = Number.isFinite(input.qty) ? Math.max(0, input.qty) : 0;
  const cost = Number.isFinite(input.costPerUnit)
    ? Math.max(0, input.costPerUnit)
    : 0;
  const adjPrice = Math.round(input.price * (1 + input.shiftPct / 100));
  const revenue = qty * adjPrice;
  const totalCost = qty * cost;
  const net = revenue - totalCost;
  return {
    adjPrice,
    revenue,
    totalCost,
    profit: net,
    margin: revenue ? round1((net / revenue) * 100) : 0,
  };
}

/** Pakistani mobile number without the +92 prefix, e.g. 3001234567. */
export const PHONE_RE = /^3\d{9}$/;
export const normalizePhone = (input: string) => {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("92")) return digits.slice(2);
  if (digits.startsWith("0")) return digits.slice(1);
  return digits;
};
export const toE164 = (local: string) => `+92${normalizePhone(local)}`;

const phone = z
  .string()
  .transform(normalizePhone)
  .refine((p) => PHONE_RE.test(p), { message: "PHONE_INVALID" });
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "DATE_INVALID");

export const profileSchema = z.object({
  name: z.string().trim().min(2, "NAME_SHORT").max(60, "NAME_LONG"),
  phone,
  email: z.string().trim().toLowerCase().email("EMAIL_INVALID").max(120, "EMAIL_INVALID"),
  district: z.enum(DISTRICTS, { message: "DISTRICT_REQUIRED" }),
  role: z.enum(ROLES, { message: "ROLE_REQUIRED" }),
  language: z.enum(LANGS).optional(),
});
export type ProfileInput = z.input<typeof profileSchema>;

export const profilePatchSchema = profileSchema.partial().extend({
  marketId: z.string().optional(),
  emailAlerts: z.boolean().optional(),
});

/** Listing form. `today` is the Pakistan date the check runs against. */
export const listingSchema = (today: string, keepDate?: string) =>
  z.object({
    cropId: z.string().min(1, "CROP_REQUIRED"),
    quantity: z.coerce
      .number({ message: "QTY_POSITIVE" })
      .refine((n) => Number.isFinite(n) && n > 0, "QTY_POSITIVE")
      .refine((n) => n <= 100000, "QTY_TOO_LARGE"),
    askingPrice: z.coerce
      .number({ message: "PRICE_POSITIVE" })
      .refine((n) => Number.isFinite(n) && n > 0, "PRICE_POSITIVE")
      .refine((n) => n <= 10000000, "PRICE_TOO_LARGE"),
    district: z.enum(DISTRICTS, { message: "DISTRICT_REQUIRED" }),
    grade: z.enum(GRADES, { message: "GRADE_REQUIRED" }),
    availableFrom: dateKey.refine(
      (d) => d >= today || (keepDate !== undefined && d === keepDate),
      "DATE_PAST",
    ),
    contactPhone: phone,
  });
export type ListingInput = z.input<ReturnType<typeof listingSchema>>;

export const alertSchema = z.object({
  cropId: z.string().min(1, "CROP_REQUIRED"),
  marketId: z.string().min(1, "MARKET_REQUIRED"),
  condition: z.enum(CONDITIONS),
  targetPrice: z.coerce
    .number({ message: "PRICE_POSITIVE" })
    .refine((n) => Number.isFinite(n) && n > 0, "PRICE_POSITIVE"),
  active: z.boolean().default(true),
});
export type AlertInput = z.input<typeof alertSchema>;

/** A farmer's own crop, added from the Sell form's crop picker. */
export const cropSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "CROP_NAME_SHORT")
    .max(40, "CROP_NAME_LONG")
    .regex(/^[\p{L}\p{M} .'-]+$/u, "CROP_NAME_INVALID"),
  nameUr: z.string().trim().max(40, "CROP_NAME_LONG").optional(),
  category: z.enum(CATEGORIES, { message: "CATEGORY_REQUIRED" }),
});
export type CropInput = z.input<typeof cropSchema>;

/** A mandi added by a farmer or buyer from the market picker. */
export const marketSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "MARKET_NAME_SHORT")
    .max(50, "MARKET_NAME_LONG")
    .regex(/^[\p{L}\p{M}\p{N} .'&()-]+$/u, "MARKET_NAME_INVALID"),
  nameUr: z.string().trim().max(50, "MARKET_NAME_LONG").optional(),
  district: z.enum(DISTRICTS, { message: "DISTRICT_REQUIRED" }),
});
export type MarketInput = z.input<typeof marketSchema>;

/** A farmer's or buyer's request for the admin to add a market. */
export const marketRequestSchema = marketSchema.extend({
  note: z.string().trim().max(200, "NOTE_LONG").optional(),
});
export type MarketRequestInput = z.input<typeof marketRequestSchema>;

/** Admin: today's prices for one market (Rs per 40 kg). */
export const pricePublishSchema = z.object({
  marketId: z.string().min(1, "MARKET_REQUIRED"),
  items: z
    .array(
      z.object({
        cropId: z.string().min(1, "CROP_REQUIRED"),
        price: z.coerce
          .number({ message: "PRICE_POSITIVE" })
          .refine((n) => Number.isFinite(n) && n > 0, "PRICE_POSITIVE")
          .refine((n) => n <= 10000000, "PRICE_TOO_LARGE"),
      }),
    )
    .min(1, "PRICES_REQUIRED")
    .max(300),
});

export const EXPENSE_CATEGORIES = [
  "seed",
  "fertilizer",
  "pesticide",
  "labour",
  "irrigation",
  "machinery",
  "transport",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** A farmer's cost on one crop (Rs). `date` is a Pakistan day, not in the future. */
export const expenseSchema = (today: string) =>
  z.object({
    cropId: z.string().min(1, "CROP_REQUIRED"),
    category: z.enum(EXPENSE_CATEGORIES, { message: "CATEGORY_REQUIRED" }),
    amount: z.coerce
      .number({ message: "AMOUNT_POSITIVE" })
      .refine((n) => Number.isFinite(n) && n > 0, "AMOUNT_POSITIVE")
      .refine((n) => n <= 100000000, "AMOUNT_TOO_LARGE"),
    note: z.string().trim().max(200, "NOTE_LONG").optional(),
    date: dateKey.refine((d) => d <= today, "DATE_FUTURE"),
  });
export type ExpenseInput = z.input<ReturnType<typeof expenseSchema>>;

/** Maund amounts keep two decimals (avoids 0.1 + 0.2 noise in stock). */
export const round2 = (n: number) => Math.round(n * 100) / 100;

export const SUPPORT_TOPICS = ["market", "price", "account", "other"] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number];

/** "Contact admin" from a farmer or buyer. */
export const supportSchema = z.object({
  topic: z.enum(SUPPORT_TOPICS, { message: "TOPIC_REQUIRED" }),
  message: z.string().trim().min(5, "MESSAGE_SHORT").max(500, "MESSAGE_LONG"),
});

/** "green  chilli" → "Green Chilli" */
export const cropTitle = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

/** Crop names the AI may map speech to (English, Urdu, Sindhi). */
export const CROP_ALIASES_HINT =
  "Wheat (گندم/ڪڻڪ), Rice (چاول/چانور), Cotton (کپاس/ڪپهه), Sugarcane (گنا/ڪمند), Onion (پیاز/بصر), Tomato (ٹماٹر/ٽماٽا), Mango (آم/انب), Banana (کیلا/ڪيلو)";
