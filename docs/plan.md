# KisanMandi — Plan, Status & Roadmap

> **Scenario:** farmers in Sindh often agree a price without knowing today's rate at nearby mandis. KisanMandi shows market prices, compares mandis, raises price alerts, estimates profit, and connects farmers with buyers for direct sale.
> **Stack:** Expo SDK 57 + Expo Router · Convex (DB, REST API, crons, file storage) · Better Auth (email/password + Google) · Resend (verification, recovery, alerts) · AWS Bedrock (AI) · Groq Whisper (speech→text) · expo-speech (text→speech).
> **Designs:** `references/01_welcome` … `references/12_ Profit Calculator`, plus the overview image `references/image.png`.
> **Last updated:** 2026-10-21

**Status legend**

| Mark | Meaning |
|---|---|
| ✅ | Done and verified (API tested live, or seen on a device) |
| 🟡 | Built and passing typecheck + lint, **not yet checked on a device with real data** |
| ⬜ | Not started |
| ⚠️ | Known gap or decision needed |

---

## 0. Summary

| Area | Status |
|---|---|
| Backend: schema, REST API, business rules, seed, cron | ✅ deployed to dev, seeded, logic tested |
| Recoverable auth (email/password, verification, Google, reset) | 🟡 built and passing checks; live device QA pending |
| Screens 01–12 + Profile tab | 🟡 all built, connected and compiling; device QA pending |
| Extras: AI advice, voice-filled listing, email alerts, read aloud | 🟡 built; secrets are set but not exercised live |
| Urdu / Sindhi UI language | ⬜ crop names show Urdu script; UI text is English only |
| **New:** AI assistant chatbot with voice ("Kisan Dost") | ⬜ planned in §6 |
| **New:** WhatsApp-style buyer ↔ farmer chat | ⬜ planned in §7 |
| Release: production deploy, EAS build | ⬜ |

---

## 1. Milestones vs. scenario rules

### Milestone 1 — User roles & price discovery
| Rule | Status | Where |
|---|---|---|
| First launch collects name, phone, district, Farmer/Buyer (plus email) | ✅ API · 🟡 UI | `welcome.tsx`, `profile-setup.tsx`, `PATCH /users/me` |
| Searchable district picker covering all of Pakistan | 🟡 | `components/kisan/districts.ts`, `SelectSheet searchable` |
| Farmers: Prices, Marketplace, Alerts, Listings tabs. Buyers: Prices, Marketplace. Both: Profile. | 🟡 UI · ✅ API (403 `FARMERS_ONLY`) | `(tabs)/_layout.tsx` |
| Today's prices for the selected market, crop search, category filter | ✅ API · 🟡 UI | `(tabs)/prices.tsx`, `GET /prices` |
| Daily change (today − yesterday) as amount and % | ✅ | `priceChange()` |
| Pull-to-refresh | 🟡 | `useResource().refresh` |

### Milestone 2 — Crop trends & market comparison
| Rule | Status | Where |
|---|---|---|
| 14-day line chart for a crop in the selected market | ✅ API · 🟡 UI ⚠️ dashed line under the last point and its labels may need tweaks | `crop/[cropId].tsx`, `price-chart.tsx` |
| Min, max and average over the period | ✅ | `GET /prices/history` |
| Markets sorted best price first, with the best place to sell highlighted | ✅ API · 🟡 UI | `GET /prices/compare` |

### Milestone 3 — Price alerts
| Rule | Status | Where |
|---|---|---|
| Crop, market, Above/Below, target price | 🟡 | `alert-form.tsx` |
| Above: latest ≥ target · Below: latest ≤ target | ✅ tested (2 triggered, "Rs 120 to go", paused) | `evaluateAlert()` |
| Active toggle + delete | ✅ API · 🟡 UI | `PATCH`/`DELETE /alerts/:id` |
| Re-evaluated on every refresh; badge count on the Alerts tab | ✅ API · 🟡 UI | `GET /alerts` → `triggeredCount`, `FloatingTabBar` |

### Milestone 4 — Listings & marketplace
| Rule | Status | Where |
|---|---|---|
| Listing fields: qty > 0, price > 0, district, grade A/B/C, date not in the past, phone | ✅ API (same zod schema) · 🟡 UI | `sell.tsx`, `listingSchema()` |
| Search; filter by crop, district, grade; sort newest or price ascending | ✅ API · 🟡 UI | `marketplace.tsx`, `filter-sheet.tsx` |
| Below/At/Above market label (±5% of the cross-market average is At) | ✅ tested | `marketLabel()` |
| Detail page with Call + WhatsApp | 🟡 | `listing/[id].tsx` |
| Only the owner can edit, mark sold or delete | ✅ API (403 `FORBIDDEN`) · 🟡 UI | `listings.ts ownListing()` |

### Milestone 5 — Profit calculator
| Rule | Status | Where |
|---|---|---|
| Crop + market, quantity, cost per unit | 🟡 | `profit.tsx` |
| Revenue, total cost, profit/loss, margin % | ✅ pure function (150 × 3,850 at +10%, cost 3,000 → Rs 185,250 · 29.2%) | `profit()` |
| What-if slider, ±20% | 🟡 | `sell/percent-slider.tsx` |

### Milestone 6 — Mock API & seed
| Rule | Status |
|---|---|
| All reads and writes go through the REST collections users, crops, markets, prices, listings, alerts | ✅ `convex/rest/routes.ts` |
| 8 crops in 4 categories, 3 markets in different districts | ✅ seeded |
| 14 consecutive days of prices for every crop–market pair (336 rows) | ✅ seeded; a daily cron adds new days |
| 6 users, 12 listings, 5 alerts; fictional data only | ✅ seeded |

### Extras built
| Feature | Status | Notes |
|---|---|---|
| AI "sell now or wait?" advice | 🟡 | Bedrock Haiku 4.5, cached per crop/market/day; AWS secrets are set |
| Voice-filled listing (speak → form) | 🟡 | Whisper → Bedrock parse → user reviews the form |
| Price-alert emails | 🟡 | Resend; sent once per alert per day; Profile has an on/off switch |
| Read price aloud | 🟡 | `expo-speech` |
| Daily price cron (00:05 PKT) | ✅ deployed | `prices.rollDay` |

---

## 2. How the app works (current flow)

```
First launch
  └─ Welcome (01) ── Get Started / Skip ──► Create account (02)
                                              name · phone · email · password · district · Farmer/Buyer
                                              │ verify 6-digit email code
                                              └─ PATCH /api/v1/users/me → profile + default mandi
                                              ▼
                         Tabs ── Farmer: Prices · Market · Alerts(badge) · Listings · Profile
                              └─ Buyer:  Prices · Market · Profile
Next launches: session restored → straight to Prices. Log out → login with email/password or Google.
```

### Screen links
| From | Action | To |
|---|---|---|
| Prices (03) | crop row / calculator / avatar | Crop detail (04) / Profit (12) / Profile |
| Crop detail (04) | Set alert / Estimate profit / Ask AI | Alert form (06) / Profit (12) / inline advice |
| Alerts (05) | + New / tap card | Alert form (06) new / edit |
| Market (07) | filter / card | Filter sheet (08) / Listing detail (09) |
| Listing detail (09) | Call / WhatsApp / (owner) Edit | phone / WhatsApp / Sell (11) |
| My Listings (10) | + Sell produce / Edit | Sell (11) |
| Profile | Edit profile / My mandi / Log out | Tell us about you (02) / mandi sheet / Welcome |

### How a request flows
```
Screen ─ useResource(path) / api.* ─► https://<dep>.convex.site/api/v1/...  (Bearer Convex JWT)
       ─► convex/rest/routes.ts: zod validation · access check (user / profile / farmer / owner) · PK "today"
       ─► internal query/mutation/action ─► Convex tables
Writes then call invalidate(prefix) so cached lists refetch. Pull-to-refresh calls refresh().
```

---

## 3. Project structure

```
src/app/
├── _layout.tsx            root stack, fonts, AuthProvider, signed-in/out guards
├── index.tsx              entry router
├── welcome.tsx            01
├── profile-setup.tsx      02  (sign-up + edit profile)
├── (tabs)/_layout.tsx     role-based tabs, floating bar, alert badge
├── (tabs)/prices.tsx      03
├── (tabs)/marketplace.tsx 07 + 08
├── (tabs)/alerts.tsx      05 (farmer)
├── (tabs)/listings.tsx    10 (farmer)
├── (tabs)/profile.tsx     Profile (both)
├── crop/[cropId].tsx      04
├── listing/[id].tsx       09
├── alert-form.tsx         06 (modal)
├── sell.tsx               11 (modal)
└── profit.tsx             12

src/components/kisan/   ui.tsx · text-field.tsx · tap.tsx · hills-scene.tsx · floating-tab-bar.tsx · districts.ts
                        prices/price-chart.tsx · market/crop-art.tsx · market/filter-sheet.tsx
                        sell/date-sheet.tsx · sell/percent-slider.tsx
src/lib/                api/{client,resources,token-cache,types}.ts · auth-client.ts · format.ts
                        form-errors.ts · profile-draft.ts · welcome-seen.ts · zod-resolver.ts
src/hooks/              use-voice-input.ts (record → Whisper)

convex/                 schema.ts · users.ts · crops.ts · markets.ts · prices.ts · alerts.ts · listings.ts
                        ai.ts · advice.ts · email.ts · seed.ts · crons.ts · auth.ts · http.ts
convex/rest/            helpers.ts (route(), access, zod parse, errors) · routes.ts (all /api/v1 routes)
convex/lib/kisan.ts     shared rules + zod schemas + all Pakistan districts
```

### Database (current)
| Table | Key fields |
|---|---|
| `users` | authId, name, contactEmail, phone, district, role, marketId, emailAlerts, isSeed |
| `crops` | name, nameUr, nameSd, category, icon |
| `markets` | name, nameUr, nameSd, district |
| `prices` | cropId, marketId, date, price |
| `listings` | userId, cropId, quantity, askingPrice, district, grade, availableFrom, contactPhone, status |
| `alerts` | userId, cropId, marketId, condition, targetPrice, active, lastTriggeredOn |
| `adviceCache` | key, advice |

### REST API (`/api/v1`)
`users/me` (GET, PATCH) · `crops` · `markets` · `prices` · `prices/history` · `prices/compare` · `alerts` (GET re-evaluates, POST, PATCH/DELETE `:id`) · `listings` (GET, POST, PATCH/DELETE `:id`) · `listings/mine` · `ai/advice` · `ai/parse-listing`.

Errors come back as `{error:{code,message,field?}}`. Status codes: 400 bad input, 401 signed out, 403 profile incomplete / farmers only / not owner, 404 not found.

---

## 4. Remaining work on the current scope

| # | Task | Priority | Notes |
|---|---|---|---|
| R1 | **Device QA pass** of every screen against `references/` with seeded data (Android dev build + web) | P0 | Check the chart, the floating tab bar with 5 tabs, sheets with the keyboard open, long district names |
| R2 | Live test of AI advice, voice-filled listing and alert email | P0 | Secrets are set; check Bedrock model access and that the Resend sender domain is verified |
| R3 | **Urdu / Sindhi UI language** | P1 | `src/lib/i18n/{en,ur,sd}.ts` + `useT()`; language picker in Profile and on first launch; right-to-left text alignment; Noto Nastaliq Urdu / Noto Naskh fonts |
| R4 | Unit tests for `convex/lib/kisan.ts` (±5% edges, alert at equality, profit numbers, PK midnight) | P1 | `node --test` like the removed auth tests |
| R5 | Live QA email verification, Google OAuth, and password reset on Android and web | P0 | Confirm Google redirect URI and verified Resend sender in production |
| R6 | Add auth-flow integration tests for duplicate registration and expired/reused codes | P1 | Keep recovery responses resistant to email enumeration |
| R7 | AI rate limits per user (`@convex-dev/rate-limiter`) | P2 | Only a per-day cache today |
| R8 | Verify production Google OAuth credentials and redirect URI | P1 | |
| R9 | Production: `npx convex deploy` with prod env; EAS build (`eas build -p android`) | P1 (before demo) | |

---

## 5. Roadmap overview (new features)

| Phase | Feature | Depends on |
|---|---|---|
| A | R1–R2 QA and fixes | — |
| B | **AI assistant "Kisan Dost"**: text + voice chat with app data (§6) | A |
| C | **Buyer ↔ farmer chat**, WhatsApp style (§7) | A |
| D | Urdu / Sindhi (R3), applied to the chat screens too | B, C |
| E | Push notifications for new messages and alerts (§8) | C |
| F | Production release (R9) | all |

**Tab layout once chat exists** (6 tabs is too many):
- Farmer: **Prices · Market · Chats · Alerts · Listings**; Profile opens from the header avatar.
- Buyer: **Prices · Market · Chats · Profile**.
- Kisan Dost: a floating green mic/chat button on Prices, Crop detail and Market.

---

## 6. ⬜ AI assistant with voice — "Kisan Dost" (Phase B)

**Goal:** farmers ask in Urdu, Sindhi or English by typing or speaking, e.g. "Aaj Hyderabad mein gandum ka rate kya hai?", "Where should I sell my cotton?", "Set an alert when tomato goes above 3,000". The assistant answers from **real app data**, can reply aloud, and can take simple actions after confirming.

### Flow
```
Chat screen ── type ─────────────────────────────┐
           └── hold mic → expo-audio → Whisper ──┤ text (language auto-detected / user language)
                                                 ▼
            POST /api/v1/assistant/messages {threadId, text}
                                                 ▼
            Convex action: @convex-dev/agent thread  (Bedrock Sonnet 4.6 / Haiku 4.5)
               tools: getTodayPrices(market) · getPriceTrend(crop, market) · compareMarkets(crop)
                      searchListings(filters) · getMyAlerts() · createAlert(...)*  · estimateProfit(...)
               * write tools return a confirmation card first; they run only after the user taps Confirm
                                                 ▼
            reply saved in the thread → app shows the bubble → (voice mode) expo-speech reads it
```

### Design decisions
| Decision | Choice | Why |
|---|---|---|
| Conversation storage | `@convex-dev/agent` component (threads, messages, tool steps) | Recommended Convex pattern for durable LLM chats; avoids a hand-rolled messages table |
| Model | Haiku 4.5 for chat and tools, Sonnet 4.6 fallback for long reasoning | Speed and cost on mobile |
| Speech → text | Existing `api.ai.transcribe` (Groq Whisper, `language: ur/sd/en`) | Already built |
| Text → speech | `expo-speech` (`ur-PK` / `en-US`; Sindhi falls back to Urdu) | On-device, free; Groq Orpheus as a later upgrade |
| Live typing | Agent streaming saved to the thread; the screen updates through a Convex reactive query | REST can't push; **documented exception** to the REST-only rule (chat isn't one of the 6 mock collections) |
| Safety | System prompt: farming and prices only; never invent prices; quote numbers from tools with their date; Rs per 40 kg | Trust |

### Screens and UI
- **`assistant.tsx`:** chat bubbles (user on the right in green, assistant on the left in white). Assistant cards can show a price table, a mini 14-day sparkline, or a "Set alert?" confirmation card with Confirm/Cancel. Suggested-question chips sit above the composer.
- **Voice mode:** a big mic button. Hold to talk, with a waveform and timer; release to send. A "Speaking…" indicator plays while the reply is read aloud, and tapping the speaker on any bubble replays it. An auto-speak toggle sits in the header.
- **Entry points:** a floating button on Prices, Crop detail and Market; a "Ask Kisan Dost" row in Profile.

### Backend work
| Item | Files |
|---|---|
| Install + mount `@convex-dev/agent` | `convex/convex.config.ts` |
| Agent definition, tools (wrap existing internal queries) | `convex/assistant.ts` (`"use node"` for actions) |
| REST: `POST /assistant/threads`, `POST /assistant/messages`, `GET /assistant/threads/:id` | `convex/rest/routes.ts` |
| Per-user rate limit (e.g. 30 msgs/hour) | `@convex-dev/rate-limiter` |

### Tasks
- ⬜ B1 Install and configure the agent component, plus the system prompt in 3 languages.
- ⬜ B2 Tools: prices, trend, compare, listings, alerts, profit; write tools only with confirmation.
- ⬜ B3 REST endpoints and a reactive thread query.
- ⬜ B4 `assistant.tsx` UI: bubbles, cards, chips, composer.
- ⬜ B5 Voice: hold-to-talk, transcription, auto-speak, replay.
- ⬜ B6 Rate limit, error states (offline, model unavailable), tests with sample Urdu questions.

---

## 7. ⬜ Buyer ↔ farmer chat, WhatsApp style (Phase C)

**Goal:** a buyer taps **Chat** on a listing and talks to the farmer inside the app with text, voice notes, photos and price offers. Phone numbers don't have to be shared.

### Data model (new tables)
| Table | Fields | Indexes |
|---|---|---|
| `conversations` | listingId, buyerId, farmerId, lastMessage (preview), lastMessageAt, buyerUnread, farmerUnread, status (open/closed) | `by_buyer_and_lastMessageAt`, `by_farmer_and_lastMessageAt`, `by_listing_and_buyer` (one chat per buyer per listing) |
| `messages` | conversationId, senderId, type (text/voice/image/offer/system), body, storageId?, durationMs?, offer {price, quantity, status: pending/accepted/declined}?, createdAt, readAt? | `by_conversation` |
| `blocks` | userId, blockedUserId | `by_user` |

### Flow
```
Listing detail (09) ── "Chat" ──► POST /api/v1/conversations {listingId}  (find or create)
                                   ▼
                       Chat screen  ⇄  POST /conversations/:id/messages {type, body | storageId | offer}
                                   ▼
             farmer's Chats tab shows unread badge → opens → messages marked read (✓✓ turns green)
Offer card: buyer proposes Rs/40kg × qty → farmer taps Accept/Decline → system message + optional "Mark sold"
```

### Real-time
Messages need to appear instantly, so the chat screens use **Convex reactive queries** (`useQuery`) for conversations and messages, and REST mutations for sending. This is the same documented exception as §6. The rest of the app keeps using REST.

### WhatsApp-style UI
- **Chats tab (`(tabs)/chats.tsx`):**
  - Rows with avatar (initials), name, crop thumbnail and listing name, last-message preview (🎤 Voice note / 📷 Photo / 💰 Offer), time, and a green unread-count bubble.
  - Search, and an Active/Archived filter.
- **Chat screen (`chat/[id].tsx`):**
  - Header: back, avatar, name, "Farmer · Hyderabad", Call icon.
  - Pinned listing card at the top (crop, grade, price, market label), tappable.
  - Cream background; my bubbles are green `#DDEBD5` on the right, theirs white on the left. Time and ✓ / ✓✓ ticks.
  - Date separators ("Today", "Yesterday"), sticky scroll-to-bottom button.
  - Composer: + attach (camera / gallery), text input, and a mic that becomes send while typing. Hold mic to record a voice note (slide left to cancel), with playback, seek bar and duration in the bubble.
  - Offer bubble: price × qty and its status; Accept/Decline buttons for the farmer.
  - Long-press a message to copy or delete for me; header menu to block or report.
- **Entry points:** "Chat" button on Listing detail (buyers), next to Call/WhatsApp. Farmers' listing cards show a "3 chats" chip.

### Backend work
| Item | Files |
|---|---|
| Tables + indexes | `convex/schema.ts` |
| `conversations.ts`: findOrCreate, list (paginated), markRead, archive; `messages.ts`: send, list (paginated), respondToOffer | new |
| Voice notes and photos: `generateUploadUrl` → upload → `storageId` on the message; signed URL when read | `convex/messages.ts`, `ctx.storage` |
| Access: only the two participants can read or send; a blocked user can't send | helpers |
| Unread counts updated in the same mutation as `send` / `markRead` | |
| REST: `POST /conversations`, `GET /conversations`, `POST /conversations/:id/messages`, `POST /conversations/:id/read`, `POST /messages/:id/offer` | `convex/rest/routes.ts` |
| Seed: 3 demo conversations with text, a voice placeholder and an offer | `convex/seed.ts` |

### Tasks
- ⬜ C1 Schema + mutations + access rules + unread counters.
- ⬜ C2 Chats tab list with unread badges; tab bar change (§5).
- ⬜ C3 Chat screen: bubbles, ticks, separators, pinned listing, pagination (load older).
- ⬜ C4 Voice notes (expo-audio record/playback + Convex storage).
- ⬜ C5 Photos (expo-image-picker + storage).
- ⬜ C6 Offers: create, accept, decline, link to Mark sold.
- ⬜ C7 Block/report, delete-for-me, empty and error states.
- ⬜ C8 Bridge to the assistant: "Ask Kisan Dost if this offer is fair" button on offer bubbles.

---

## 8. ⬜ Notifications (Phase E)
- **In-app:** unread badges on Chats and the triggered count on Alerts. Chats come in Phase C; the Alerts count is 🟡 already.
- **Push:**
  - Add `expo-notifications` (needs a new dev build), store the Expo push token on `users`, and send from Convex actions for new messages, accepted offers and newly triggered alerts.
  - Respect a Profile setting for each type.
- **Email:** price alerts 🟡 already; optionally a daily digest of unread chats.

---

## 9. Definition of done (per feature)
1. Matches the reference design, or the UI spec above for new screens.
2. `npx tsc --noEmit`, `npx tsc --noEmit -p convex/tsconfig.json` and `npx expo lint` are clean.
3. API behaviour checked with real data: seed, then call the endpoints.
4. Seen working on an Android device and on web.
5. Docs updated: this file, plus `AGENTS.md` for any new conventions.

## 10. Commands
```bash
npx convex dev                     # backend (or --once)
npx convex run seed:run            # demo data  ('{"reset":true}' to reseed)
npx convex run seed:adoptDemo '{"email":"you@example.com"}'   # give your account the demo listings/alerts
npx expo start                     # app;  npx expo run:android for a dev build
npx tsc --noEmit && npx tsc --noEmit -p convex/tsconfig.json && npx expo lint && npx expo-doctor
```
