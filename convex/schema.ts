import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const roleValidator = v.union(v.literal("farmer"), v.literal("buyer"));
export const langValidator = v.union(
  v.literal("en"),
  v.literal("ur"),
  v.literal("sd"),
);
export const categoryValidator = v.union(
  v.literal("grain"),
  v.literal("cash"),
  v.literal("vegetable"),
  v.literal("fruit"),
);
export const gradeValidator = v.union(
  v.literal("A"),
  v.literal("B"),
  v.literal("C"),
);
export const conditionValidator = v.union(
  v.literal("above"),
  v.literal("below"),
);
export const listingStatusValidator = v.union(
  v.literal("active"),
  v.literal("sold"),
);
export const messageTypeValidator = v.union(
  v.literal("text"),
  v.literal("voice"),
  v.literal("image"),
  v.literal("offer"),
  v.literal("system"),
);
export const offerStatusValidator = v.union(
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("declined"),
);

// Better Auth keeps its own tables (user, account, session, verification...)
// inside the betterAuth component. `users` mirrors each auth user into the app
// through the triggers in convex/auth.ts, so app tables can reference
// Id<"users">. Seeded demo users use authId "seed:N" and isSeed: true.
export default defineSchema({
  users: defineTable({
    authId: v.string(),
    name: v.string(),
    email: v.string(),
    image: v.optional(v.string()),
    emailVerified: v.boolean(),
    // `email` is the login identity. `contactEmail` can be edited separately
    // for price alerts and marketplace contact details.
    contactEmail: v.optional(v.string()),
    phone: v.optional(v.string()),
    district: v.optional(v.string()),
    role: v.optional(roleValidator),
    language: v.optional(langValidator),
    marketId: v.optional(v.id("markets")),
    emailAlerts: v.optional(v.boolean()),
    isSeed: v.optional(v.boolean()),
  })
    .index("by_authId", ["authId"])
    .index("by_email", ["email"])
    .index("by_isSeed", ["isSeed"]),

  crops: defineTable({
    name: v.string(),
    nameUr: v.string(),
    nameSd: v.string(),
    category: categoryValidator,
    icon: v.string(),
    // Set on crops a farmer added from the Sell form; seed crops leave it empty.
    createdBy: v.optional(v.id("users")),
  })
    .index("by_name", ["name"])
    .index("by_category", ["category"])
    .index("by_createdBy", ["createdBy"]),

  markets: defineTable({
    name: v.string(),
    nameUr: v.string(),
    nameSd: v.string(),
    district: v.string(),
    // Set when a farmer or buyer added the market (seeded ones have none).
    createdBy: v.optional(v.id("users")),
  })
    .index("by_district", ["district"])
    .index("by_createdBy", ["createdBy"]),

  // A farmer or buyer asking the admin to add a mandi that isn't listed.
  marketRequests: defineTable({
    userId: v.id("users"),
    name: v.string(),
    nameUr: v.string(),
    district: v.string(),
    note: v.string(),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    // The market created (or matched) on approval.
    marketId: v.optional(v.id("markets")),
  })
    .index("by_status", ["status"])
    .index("by_userId_and_status", ["userId", "status"]),

  // A user's personal MCP link for ChatGPT / Claude. Only the SHA-256 hash of
  // the secret is stored; the full link is shown once when it's created.
  mcpKeys: defineTable({
    userId: v.id("users"),
    hash: v.string(),
    // First characters of the secret, so the user can recognise their link.
    prefix: v.string(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_hash", ["hash"])
    .index("by_userId", ["userId"]),

  // "Contact admin" messages from farmers and buyers.
  supportMessages: defineTable({
    userId: v.id("users"),
    topic: v.union(v.literal("market"), v.literal("price"), v.literal("account"), v.literal("other")),
    message: v.string(),
    status: v.union(v.literal("open"), v.literal("done")),
  })
    .index("by_status", ["status"])
    .index("by_userId_and_status", ["userId", "status"]),

  // Rs per 40 kg (one maund) for one crop in one market on one day.
  prices: defineTable({
    cropId: v.id("crops"),
    marketId: v.id("markets"),
    date: v.string(),
    price: v.number(),
    // The admin who entered it; unset for seeded / daily auto-rolled prices.
    publishedBy: v.optional(v.id("users")),
  })
    .index("by_market_and_date", ["marketId", "date"])
    .index("by_crop_and_market_and_date", ["cropId", "marketId", "date"])
    .index("by_date", ["date"]),

  listings: defineTable({
    userId: v.id("users"),
    cropId: v.id("crops"),
    quantity: v.number(),
    askingPrice: v.number(),
    district: v.string(),
    grade: gradeValidator,
    availableFrom: v.string(),
    contactPhone: v.string(),
    status: listingStatusValidator,
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_user_and_status", ["userId", "status"]),

  alerts: defineTable({
    userId: v.id("users"),
    cropId: v.id("crops"),
    marketId: v.id("markets"),
    condition: conditionValidator,
    targetPrice: v.number(),
    active: v.boolean(),
    lastTriggeredOn: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  // ---- Buyer <-> farmer chat (docs/plan.md §7) ----
  // One conversation per buyer per listing. Unread counters and the preview
  // are updated in the same mutation as send / markRead.
  conversations: defineTable({
    listingId: v.id("listings"),
    buyerId: v.id("users"),
    farmerId: v.id("users"),
    lastMessage: v.string(),
    lastMessageType: messageTypeValidator,
    lastSenderId: v.optional(v.id("users")),
    lastMessageAt: v.number(),
    buyerUnread: v.number(),
    farmerUnread: v.number(),
    /** Last time each side opened the chat; drives the read ticks. */
    buyerLastReadAt: v.number(),
    farmerLastReadAt: v.number(),
    buyerArchived: v.boolean(),
    farmerArchived: v.boolean(),
    status: v.union(v.literal("open"), v.literal("closed")),
  })
    .index("by_buyer_and_lastMessageAt", ["buyerId", "lastMessageAt"])
    .index("by_farmer_and_lastMessageAt", ["farmerId", "lastMessageAt"])
    .index("by_listing_and_buyer", ["listingId", "buyerId"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    /** Absent for system messages. */
    senderId: v.optional(v.id("users")),
    type: messageTypeValidator,
    body: v.string(),
    storageId: v.optional(v.id("_storage")),
    durationMs: v.optional(v.number()),
    offer: v.optional(
      v.object({
        price: v.number(),
        quantity: v.number(),
        status: offerStatusValidator,
      }),
    ),
    createdAt: v.number(),
    readAt: v.optional(v.number()),
    /** "Delete for me": at most the two participants. */
    deletedFor: v.optional(v.array(v.id("users"))),
  }).index("by_conversation", ["conversationId"]),

  blocks: defineTable({
    userId: v.id("users"),
    blockedUserId: v.id("users"),
  }).index("by_user_and_blockedUserId", ["userId", "blockedUserId"]),

  reports: defineTable({
    reporterId: v.id("users"),
    reportedUserId: v.id("users"),
    conversationId: v.id("conversations"),
    reason: v.string(),
  }).index("by_reportedUserId", ["reportedUserId"]),

  // One Bedrock answer per crop, market, day and language.
  adviceCache: defineTable({
    key: v.string(),
    advice: v.object({
      verdict: v.union(
        v.literal("sell_now"),
        v.literal("wait"),
        v.literal("sell_elsewhere"),
      ),
      headline: v.string(),
      reasons: v.array(v.string()),
      bestMarket: v.string(),
    }),
  }).index("by_key", ["key"]),
});
