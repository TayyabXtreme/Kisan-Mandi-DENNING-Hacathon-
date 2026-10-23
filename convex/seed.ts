import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { addDays, HISTORY_DAYS, todayPK, type Category } from "./lib/kisan";

// All names, phone numbers and prices below are fictional demo data.

const CROPS: {
  name: string;
  nameUr: string;
  nameSd: string;
  category: Category;
  icon: string;
  base: number;
  step: number;
}[] = [
  { name: "Wheat", nameUr: "گندم", nameSd: "ڪڻڪ", category: "grain", icon: "wheat", base: 3750, step: 10 },
  { name: "Rice", nameUr: "چاول", nameSd: "چانور", category: "grain", icon: "rice", base: 6250, step: 10 },
  { name: "Cotton", nameUr: "کپاس", nameSd: "ڪپهه", category: "cash", icon: "cotton", base: 8050, step: 10 },
  { name: "Sugarcane", nameUr: "گنا", nameSd: "ڪمند", category: "cash", icon: "sugarcane", base: 450, step: 5 },
  { name: "Onion", nameUr: "پیاز", nameSd: "بصر", category: "vegetable", icon: "onion", base: 2350, step: 10 },
  { name: "Tomato", nameUr: "ٹماٹر", nameSd: "ٽماٽا", category: "vegetable", icon: "tomato", base: 2950, step: 10 },
  { name: "Mango", nameUr: "آم", nameSd: "انب", category: "fruit", icon: "mango", base: 4800, step: 10 },
  { name: "Banana", nameUr: "کیلا", nameSd: "ڪيلو", category: "fruit", icon: "banana", base: 2150, step: 10 },
];

const MARKETS = [
  { name: "Hyderabad Mandi", nameUr: "حیدرآباد منڈی", nameSd: "حيدرآباد منڊي", district: "Hyderabad", factor: 1 },
  { name: "Sukkur Grain Market", nameUr: "سکھر غلہ منڈی", nameSd: "سکر اناج منڊي", district: "Sukkur", factor: 1.03 },
  { name: "Mirpur Khas Mandi", nameUr: "میرپورخاص منڈی", nameSd: "ميرپورخاص منڊي", district: "Mirpur Khas", factor: 0.97 },
];

const USERS = [
  { name: "Allah Bux", district: "Hyderabad", role: "farmer", phone: "+923000000101" },
  { name: "Ghulam Rasool", district: "Sukkur", role: "farmer", phone: "+923000000102" },
  { name: "Naseem Bibi", district: "Mirpur Khas", role: "farmer", phone: "+923000000103" },
  { name: "Karam Ali", district: "Larkana", role: "farmer", phone: "+923000000104" },
  { name: "Saima Traders", district: "Karachi", role: "buyer", phone: "+923000000105" },
  { name: "Imran Wholesale", district: "Hyderabad", role: "buyer", phone: "+923000000106" },
] as const;

// [seller index, crop, quantity, price factor vs base, district, grade, days from today, sold]
const LISTINGS: [number, string, number, number, string, "A" | "B" | "C", number, boolean][] = [
  [0, "Wheat", 150, 1.0, "Hyderabad", "A", 3, false],
  [1, "Cotton", 80, 1.09, "Sukkur", "A", 1, false],
  [2, "Onion", 200, 0.88, "Mirpur Khas", "A", 0, false],
  [2, "Mango", 60, 1.02, "Mirpur Khas", "A", 5, false],
  [0, "Tomato", 90, 1.02, "Hyderabad", "A", 2, false],
  [0, "Rice", 120, 1.07, "Hyderabad", "B", 4, false],
  [3, "Rice", 300, 0.94, "Larkana", "B", 6, false],
  [1, "Wheat", 250, 1.03, "Sukkur", "B", 2, false],
  [3, "Sugarcane", 900, 0.98, "Larkana", "C", 1, false],
  [2, "Banana", 70, 1.12, "Mirpur Khas", "B", 3, false],
  [1, "Tomato", 40, 0.97, "Sukkur", "C", -2, true],
  [3, "Cotton", 100, 1.0, "Larkana", "A", -4, true],
];

// [user index, crop, market, condition, target offset vs latest, active]
const ALERTS: [number, string, string, "above" | "below", number, boolean][] = [
  [0, "Cotton", "Hyderabad Mandi", "above", -200, true],
  [0, "Tomato", "Hyderabad Mandi", "above", -100, true],
  [0, "Wheat", "Sukkur Grain Market", "above", 120, true],
  [0, "Onion", "Mirpur Khas Mandi", "below", -150, false],
  [1, "Rice", "Sukkur Grain Market", "below", -250, true],
];

/** Deterministic PRNG, so every seed run produces the same series. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/** Chats depend on listings, so a reset removes them (and their files) too. */
async function wipeChats(ctx: MutationCtx, onlySeed: boolean) {
  const seedIds = new Set<Id<"users">>();
  for await (const user of ctx.db.query("users").withIndex("by_isSeed", (q) => q.eq("isSeed", true)))
    seedIds.add(user._id);
  for await (const conv of ctx.db.query("conversations")) {
    if (onlySeed && !(seedIds.has(conv.buyerId) && seedIds.has(conv.farmerId))) continue;
    for await (const m of ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conv._id))) {
      if (m.storageId) await ctx.storage.delete(m.storageId);
      await ctx.db.delete("messages", m._id);
    }
    await ctx.db.delete("conversations", conv._id);
  }
  if (onlySeed) return;
  // Blocks and reports between real users survive; only seed users go away.
  for await (const row of ctx.db.query("blocks"))
    if (seedIds.has(row.userId) || seedIds.has(row.blockedUserId)) await ctx.db.delete("blocks", row._id);
  for await (const row of ctx.db.query("reports"))
    if (seedIds.has(row.reporterId) || seedIds.has(row.reportedUserId)) await ctx.db.delete("reports", row._id);
}

type DemoExtra = {
  /** Offer price as a share of the asking price. */
  price?: number;
  quantity?: number;
  status?: "pending" | "accepted" | "declined";
  durationMs?: number;
};
// [from: buyer | farmer | system, type, body, minutes ago, extra]
type DemoMessage = ["b" | "f" | "s", "text" | "voice" | "offer" | "system", string, number, DemoExtra?];
// [buyer index, seller index, crop, script]
const CHATS: [number, number, string, DemoMessage[]][] = [
  [4, 0, "Wheat", [
    ["s", "system", "Chat started about Wheat · Grade A. Phone numbers stay private.", 60 * 26],
    ["b", "text", "Salam Allah Bux sahib, is the wheat still available?", 60 * 26],
    ["f", "text", "Walaikum salam. Yes, 150 maund, dry and cleaned.", 60 * 25],
    ["b", "text", "Can you send it to Karachi or is it pickup only?", 60 * 25 - 5],
    // Voice placeholder: no audio file, the bubble shows it as unavailable.
    ["f", "voice", "", 60 * 24, { durationMs: 8000 }],
    ["b", "text", "Theek hai. I will confirm tomorrow morning.", 35],
  ]],
  [5, 0, "Tomato", [
    ["s", "system", "Chat started about Tomato · Grade A. Phone numbers stay private.", 60 * 5],
    ["b", "text", "Are the tomatoes from this week's picking?", 60 * 5],
    ["f", "text", "Yes, picked on Monday. Firm and red.", 60 * 4],
    ["b", "offer", "Can do this for the whole lot.", 12, { price: 0.95, quantity: 90, status: "pending" }],
  ]],
  [4, 2, "Onion", [
    ["s", "system", "Chat started about Onion · Grade A. Phone numbers stay private.", 60 * 50],
    ["b", "text", "Naseem sahiba, I need 100 maund onion for a hotel order.", 60 * 50],
    ["f", "text", "I have 200 maund ready. Grade A, Mirpur Khas.", 60 * 49],
    ["b", "offer", "", 60 * 48, { price: 1.0, quantity: 100, status: "accepted" }],
    ["s", "system", "Offer accepted: {terms}.", 60 * 47],
    ["f", "text", "Truck can leave on Thursday. Shukriya!", 60 * 47 - 2],
  ]],
];

/** Inserts the demo chats between seed buyers and seed farmers. */
async function seedChats(ctx: MutationCtx) {
  const users = new Map<number, Id<"users">>();
  for (let i = 0; i < USERS.length; i++) {
    const u = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", `seed:${i + 1}`))
      .unique();
    if (u) users.set(i, u._id);
  }
  const now = Date.now();
  let made = 0;
  for (const [buyer, seller, cropName, script] of CHATS) {
    const buyerId = users.get(buyer);
    const farmerId = users.get(seller);
    const crop = await ctx.db.query("crops").withIndex("by_name", (q) => q.eq("name", cropName)).first();
    if (!buyerId || !farmerId || !crop) continue;
    let listing = null;
    for await (const row of ctx.db
      .query("listings")
      .withIndex("by_user_and_status", (q) => q.eq("userId", farmerId).eq("status", "active")))
      if (row.cropId === crop._id) {
        listing = row;
        break;
      }
    if (!listing) continue;
    const convId = await ctx.db.insert("conversations", {
      listingId: listing._id,
      buyerId,
      farmerId,
      lastMessage: "",
      lastMessageType: "system",
      lastMessageAt: now,
      buyerUnread: 0,
      farmerUnread: 0,
      buyerLastReadAt: now,
      farmerLastReadAt: 0,
      buyerArchived: false,
      farmerArchived: false,
      status: "open",
    });
    let lastAt = now;
    let lastPreview = "";
    let lastType: DemoMessage[1] = "system";
    let lastSender: Id<"users"> | undefined;
    let lastFarmerAt = 0;
    let farmerUnread = 0;
    let terms = "";
    const lastFarmerIndex = script.map((m) => m[0]).lastIndexOf("f");
    for (const [index, [from, type, rawBody, minutesAgo, extra]] of script.entries()) {
      const at = now - minutesAgo * 60_000;
      const senderId = from === "b" ? buyerId : from === "f" ? farmerId : undefined;
      const offer =
        type === "offer" && extra?.price
          ? {
              price: roundTo(listing.askingPrice * extra.price, 10),
              quantity: extra.quantity ?? listing.quantity,
              status: extra.status ?? ("pending" as const),
            }
          : undefined;
      if (offer) terms = `Rs ${offer.price.toLocaleString("en-US")} × ${offer.quantity} maund`;
      const body = rawBody.replace("{terms}", terms);
      // Buyer messages after the farmer's last reply stay unread for the farmer.
      if (from === "f") {
        farmerUnread = 0;
        lastFarmerAt = at;
      } else if (from === "b") farmerUnread++;
      await ctx.db.insert("messages", {
        conversationId: convId,
        senderId,
        type,
        body,
        durationMs: extra?.durationMs,
        offer,
        createdAt: at,
        // The buyer has read everything; the farmer up to their last reply.
        readAt: from === "f" || (from === "b" && index < lastFarmerIndex) ? at + 60_000 : undefined,
      });
      lastAt = at;
      lastType = type;
      lastSender = senderId;
      lastPreview = type === "voice" ? "🎤 Voice note" : offer ? `💰 Offer: ${terms}` : body;
    }
    await ctx.db.patch("conversations", convId, {
      lastMessage: lastPreview,
      lastMessageType: lastType,
      lastSenderId: lastSender,
      lastMessageAt: lastAt,
      farmerUnread,
      farmerLastReadAt: farmerUnread ? lastFarmerAt : now,
    });
    made++;
  }
  return made;
}

async function wipe(ctx: MutationCtx) {
  await wipeChats(ctx, false);
  for (const table of ["prices", "listings", "alerts", "adviceCache", "crops", "markets"] as const) {
    for await (const row of ctx.db.query(table)) await ctx.db.delete(table, row._id);
  }
  for await (const user of ctx.db.query("users")) {
    if (user.isSeed) await ctx.db.delete("users", user._id);
    else if (user.marketId) await ctx.db.patch("users", user._id, { marketId: undefined });
  }
}

/**
 * Seeds crops, markets, 14 days of prices, demo users, listings and alerts.
 * npx convex run seed:run            (skips when data exists)
 * npx convex run seed:run '{"reset":true}'   (wipes app data and reseeds)
 */
export const run = internalMutation({
  args: { reset: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<string> => {
    if (await ctx.db.query("crops").first()) {
      if (!args.reset) return "Already seeded. Pass {\"reset\":true} to reseed.";
      await wipe(ctx);
    }
    const today = todayPK(Date.now());
    const cropIds = new Map<string, Id<"crops">>();
    const marketIds = new Map<string, Id<"markets">>();
    for (const { base: _b, step: _s, ...crop } of CROPS)
      cropIds.set(crop.name, await ctx.db.insert("crops", crop));
    for (const { factor: _f, ...market } of MARKETS)
      marketIds.set(market.name, await ctx.db.insert("markets", market));

    // 14 consecutive days for every crop–market pair, ending today.
    const latest = new Map<string, number>();
    let seed = 7;
    for (const crop of CROPS) {
      for (const market of MARKETS) {
        const rand = mulberry32(seed++);
        let price = crop.base * market.factor * 0.965;
        let last = 0;
        for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
          price *= 1 + (rand() - 0.42) * 0.03;
          let value = roundTo(price, crop.step);
          // Sugarcane holds steady on the last day, so a 0.0% change shows.
          if (crop.name === "Sugarcane" && i === 0) value = last;
          last = value;
          await ctx.db.insert("prices", {
            cropId: cropIds.get(crop.name)!,
            marketId: marketIds.get(market.name)!,
            date: addDays(today, -i),
            price: value,
          });
        }
        latest.set(`${crop.name}|${market.name}`, last);
      }
    }

    const userIds: Id<"users">[] = [];
    for (const [i, user] of USERS.entries()) {
      const market = MARKETS.find((m) => m.district === user.district) ?? MARKETS[0];
      userIds.push(
        await ctx.db.insert("users", {
          authId: `seed:${i + 1}`,
          email: `seed${i + 1}@kisanmandi.test`,
          contactEmail: `seed${i + 1}@kisanmandi.test`,
          emailVerified: true,
          isSeed: true,
          name: user.name,
          phone: user.phone,
          district: user.district,
          role: user.role,
          language: "en",
          marketId: marketIds.get(market.name),
          emailAlerts: false,
        }),
      );
    }

    for (const [seller, cropName, quantity, factor, district, grade, offset, sold] of LISTINGS) {
      const crop = CROPS.find((c) => c.name === cropName)!;
      const avg =
        MARKETS.reduce((s, m) => s + latest.get(`${cropName}|${m.name}`)!, 0) / MARKETS.length;
      await ctx.db.insert("listings", {
        userId: userIds[seller],
        cropId: cropIds.get(cropName)!,
        quantity,
        askingPrice: roundTo(avg * factor, crop.step === 5 ? 5 : 50),
        district,
        grade,
        availableFrom: addDays(today, offset),
        contactPhone: USERS[seller].phone,
        status: sold ? "sold" : "active",
        updatedAt: Date.now(),
      });
    }

    for (const [user, cropName, marketName, condition, offset, active] of ALERTS) {
      await ctx.db.insert("alerts", {
        userId: userIds[user],
        cropId: cropIds.get(cropName)!,
        marketId: marketIds.get(marketName)!,
        condition,
        targetPrice: latest.get(`${cropName}|${marketName}`)! + offset,
        active,
      });
    }
    const chats = await seedChats(ctx);
    return `Seeded ${CROPS.length} crops, ${MARKETS.length} markets, ${CROPS.length * MARKETS.length * HISTORY_DAYS} prices, ${USERS.length} users, ${LISTINGS.length} listings, ${ALERTS.length} alerts, ${chats} chats (today ${today}).`;
  },
});

/**
 * Recreates only the demo chats (seed buyer <-> seed farmer), leaving every
 * other row alone. npx convex run seed:chats
 */
export const chats = internalMutation({
  args: {},
  handler: async (ctx): Promise<string> => {
    await wipeChats(ctx, true);
    return `Seeded ${await seedChats(ctx)} demo chats.`;
  },
});

/**
 * Gives a real account the first seed farmer's listings and alerts, for demos.
 * npx convex run seed:adoptDemo '{"email":"you@example.com"}'
 */
export const adoptDemo = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args): Promise<string> => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.trim().toLowerCase()))
      .first()
      // Device accounts keep the typed email in contactEmail.
      ?? (await ctx.db.query("users").filter((q) => q.eq(q.field("contactEmail"), args.email.trim().toLowerCase())).first());
    if (!user) return "No user with that email. Sign up in the app first.";
    const demo = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", "seed:1"))
      .unique();
    if (!demo) return "Run seed:run first.";
    let moved = 0;
    for await (const row of ctx.db.query("listings").withIndex("by_user_and_status", (q) => q.eq("userId", demo._id))) {
      await ctx.db.patch("listings", row._id, { userId: user._id });
      moved++;
    }
    for await (const row of ctx.db.query("alerts").withIndex("by_user", (q) => q.eq("userId", demo._id))) {
      await ctx.db.patch("alerts", row._id, { userId: user._id });
      moved++;
    }
    // The demo farmer's chats follow the listings.
    for await (const conv of ctx.db
      .query("conversations")
      .withIndex("by_farmer_and_lastMessageAt", (q) => q.eq("farmerId", demo._id))) {
      await ctx.db.patch("conversations", conv._id, { farmerId: user._id });
      for await (const m of ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) => q.eq("conversationId", conv._id)))
        if (m.senderId === demo._id) await ctx.db.patch("messages", m._id, { senderId: user._id });
      moved++;
    }
    if (!user.role) await ctx.db.patch("users", user._id, { role: "farmer" });
    return `Moved ${moved} listings, alerts and chats to ${user.email}.`;
  },
});
