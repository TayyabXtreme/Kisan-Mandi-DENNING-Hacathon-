# 🌾 KisanMandi — Crop Prices & Produce Marketplace

A mobile app for **Sindh farmers** to track wholesale crop prices, compare mandis, set price alerts, estimate profit and sell produce directly to buyers. It also includes an **AI assistant ("Kisan Dost")** that works with voice, and **WhatsApp-style chat between buyers and farmers**.

> Farmers often agree a price without knowing today's rate at nearby mandis. KisanMandi shows them live market prices and gives farmers and buyers a simple way to connect.

---

## 📱 Screenshots

<table>
  <tr>
    <td align="center"><img src="references/mokups_app/01-welcome.png" width="200" alt="Welcome"/><br/><b>Welcome / onboarding</b></td>
    <td align="center"><img src="references/mokups_app/02-prices.jpeg" width="200" alt="Today's Prices"/><br/><b>Today's Prices</b></td>
    <td align="center"><img src="references/mokups_app/03-crop-detail.png" width="200" alt="Crop detail"/><br/><b>14-day trend + compare markets</b></td>
    <td align="center"><img src="references/mokups_app/04-price-alerts.jpeg" width="200" alt="Price Alerts"/><br/><b>Price Alerts + tab badge</b></td>
  </tr>
  <tr>
    <td align="center"><img src="references/mokups_app/05-sell-produce.jpeg" width="200" alt="Sell produce"/><br/><b>Sell produce (voice fill)</b></td>
    <td align="center"><img src="references/mokups_app/06-my-listings.jpeg" width="200" alt="My Listings"/><br/><b>My Listings (owner actions)</b></td>
    <td align="center"><img src="references/mokups_app/07-profit-calculator.png" width="200" alt="Profit calculator"/><br/><b>Profit calculator (±20% what-if)</b></td>
    <td align="center"><img src="references/mokups_app/08-kisan-dost-assistant.jpeg" width="200" alt="Kisan Dost AI assistant"/><br/><b>Kisan Dost (AI assistant)</b></td>
  </tr>
</table>

Design references for every screen are in [`references/`](references/).

---

## 🧰 Tech stack

| Layer | Technology | What we use it for |
| --- | --- | --- |
| Mobile app | **React Native 0.86 + Expo SDK 57** | Cross-platform app (Android, iOS, web) |
| Navigation | **Expo Router** | File-based routes in `src/app/`, role-based tabs |
| Styling | **NativeWind** (Tailwind), Inter font | Custom UI kit in `src/components/kisan/` |
| Backend | **Convex** | Database, HTTP REST API, crons, file storage, realtime |
| Auth | **Better Auth** (`@convex-dev/better-auth`) | Email + password with 6-digit code, **Google sign-in**, password reset |
| Email | **Resend** | Verification codes, password recovery and price-alert emails |
| AI | **AWS Bedrock** (Claude Haiku 4.5) via Vercel AI SDK + `@convex-dev/agent` | Kisan Dost assistant, "sell now or wait?" advice, voice → listing |
| Speech | **Groq Whisper** (speech → text), `expo-speech` (text → speech) | Voice questions, voice-filled forms, read prices aloud |
| Rate limits | `@convex-dev/rate-limiter` | Limits AI assistant usage per user |
| Charts | `react-native-gifted-charts` | 14-day price trend line chart |
| Forms | `react-hook-form` + `zod` | Same zod schemas validate on the app and the API |
| Device | `expo-audio`, `expo-image-picker`, `expo-haptics`, `@gorhom/bottom-sheet` | Voice notes, photos, sheets, feedback |
| State / dates | `zustand`, `date-fns` | Local state, Pakistan-time dates |

---

## ✅ Requirements checklist

Every rule in the hackathon brief is implemented. The API enforces each rule as well, not only the UI.

### Milestone 1 — User roles & price discovery
| Rule | Done | Where |
| --- | :---: | --- |
| First launch collects name, phone, district and Farmer/Buyer role | ✅ | `welcome.tsx` → `profile-setup.tsx`, `PATCH /users/me` |
| Farmers: Prices, Marketplace, Alerts, My Listings · Buyers: Prices, Marketplace | ✅ | `(tabs)/_layout.tsx`; the API returns 403 `FARMERS_ONLY` to buyers |
| Today's prices for a selected market, crop search, category filter | ✅ | `(tabs)/prices.tsx`, `GET /prices` |
| Daily change (today − yesterday) as amount and % | ✅ | `priceChange()` in `convex/lib/kisan.ts` |
| Pull-to-refresh | ✅ | `useResource().refresh` |

### Milestone 2 — Crop trends & market comparison
| Rule | Done | Where |
| --- | :---: | --- |
| 14-day line chart for a crop in the selected market | ✅ | `crop/[cropId].tsx`, `price-chart.tsx` |
| Minimum, maximum and average over the period | ✅ | `GET /prices/history` |
| Markets sorted by best price, best place to sell highlighted | ✅ | `GET /prices/compare` |

### Milestone 3 — Price alerts
| Rule | Done | Where |
| --- | :---: | --- |
| Crop, market, Above/Below and target price | ✅ | `alert-form.tsx` |
| Above: latest ≥ target · Below: latest ≤ target | ✅ | `evaluateAlert()` |
| Active toggle and delete | ✅ | `PATCH` / `DELETE /alerts/:id` |
| Re-evaluated on every refresh, triggered badge on the Alerts tab | ✅ | `GET /alerts` → `triggeredCount`, `FloatingTabBar` |

### Milestone 4 — Produce listings & marketplace
| Rule | Done | Where |
| --- | :---: | --- |
| Crop, quantity > 0, price > 0, district, grade A/B/C, date not in the past, phone | ✅ | `sell.tsx` + shared `listingSchema()` |
| Search; filter by crop, district, grade; sort newest or price ascending | ✅ | `marketplace.tsx`, `filter-sheet.tsx` |
| Below / At / Above market label (±5% of cross-market average is "At") | ✅ | `marketLabel()` |
| Listing details with Call and WhatsApp actions | ✅ | `listing/[id].tsx` |
| Only the owner can edit, mark Sold or delete | ✅ | `listings.ts` `ownListing()`; API returns 403 `FORBIDDEN` |

### Milestone 5 — Profit calculator
| Rule | Done | Where |
| --- | :---: | --- |
| Crop + market, quantity, cost of production per unit | ✅ | `profit.tsx` |
| Revenue, total cost, profit/loss, margin % | ✅ | `profit()` |
| What-if control shifting price by ±20% | ✅ | `sell/percent-slider.tsx` |

### Milestone 6 — Mock API & seed data
| Rule | Done | Details |
| --- | :---: | --- |
| Read and write only through HTTP API collections users, crops, markets, prices, listings, alerts | ✅ | Custom REST API on Convex: `convex/rest/routes.ts` |
| 8 crops from at least 4 categories, 3 markets in different districts | ✅ | Grains, cash crops, vegetables, fruits · Hyderabad, Sukkur and Mirpur Khas mandis |
| 14 consecutive days of prices for every crop–market pair | ✅ | 336 price rows; a daily cron adds the next day |
| 6 users, 12 listings, 5 alerts | ✅ | `convex/seed.ts` |
| Only fictional names, phones and prices | ✅ | All seed data is made up |

---

## ✨ Extra features (beyond the brief)

### 🤖 Kisan Dost — AI assistant with voice
- Ask in **Urdu, Sindhi or English**, typed or spoken, e.g. *"Aaj Hyderabad mein gandum ka rate kya hai?"*
- Answers come from **real app data** through tools: `getTodayPrices`, `getPriceTrend`, `compareMarkets`, `searchListings`, `getMyAlerts`, `estimateProfit`, `createAlert`.
- Write actions (such as creating an alert) show a **confirmation card** first and run only after the user taps Confirm.
- Hold the mic to talk (Groq Whisper). Replies can be **read aloud** (`expo-speech`), with an auto-speak toggle.
- Price tables and cards render inside the chat. Threads are stored with `@convex-dev/agent`, and usage is rate-limited per user.
- Files: `src/app/assistant.tsx`, `convex/assistant.ts`, `convex/rest/assistant_routes.ts`.

### 💬 Buyer ↔ farmer chat (WhatsApp style)
- A buyer taps **Chat** on a listing to talk to the farmer inside the app, so phone numbers don't have to be shared.
- Message types: **text, voice notes, photos and price offers**. A farmer can **Accept/Decline** an offer.
- Read ticks (✓ / ✓✓), unread badges on the **Chats** tab, date separators, and a pinned listing card at the top of each chat.
- Archive chats, delete a message for yourself, and block or report a user.
- Messages appear instantly through Convex realtime queries; sending goes through the REST API.
- Files: `src/app/(tabs)/chats.tsx`, `src/app/chat/[id].tsx`, `convex/conversations.ts`, `convex/messages.ts`, `convex/rest/chat_routes.ts`.

### 🎙️ Voice-filled listing
Speak something like *"10 maund wheat, grade A, 3700 per 40 kg"*. Whisper transcribes it, Bedrock turns it into form fields, and the farmer reviews them before posting.

### 🧠 AI "Sell now or wait?" advice
On the crop detail screen, Bedrock reads the 14-day trend and market comparison and gives a short verdict with reasons. Advice is cached per crop, market and day.

### 📧 Email price alerts (Resend)
When an alert triggers, the farmer gets an email (at most once per alert per day). It can be switched on or off in Profile.

### 🔐 Full authentication (Better Auth)
- Email + password sign-up with a **6-digit email verification code** (sent with Resend).
- **Continue with Google** (OAuth).
- **Forgot password** with an emailed reset code.
- Sessions are restored on launch. Every Better Auth user is mirrored into the app `users` table.

### Other extras
- Searchable district picker covering **all districts of Pakistan**.
- Crop names shown in **Urdu script** next to English.
- Profile tab: edit profile, choose your default mandi, email alert switch, log out.
- **DiceBear avatars** with a fallback to initials.
- A **daily cron** (00:05 PKT) rolls prices forward so the data stays "today".

---

## 🗺️ App flow

```
First launch
  └─ Welcome ── Get Started ──► Create account
                                 name · phone · email · password · district · Farmer/Buyer
                                 │ verify 6-digit email code   (or Continue with Google)
                                 ▼
          Farmer tabs: Prices · Market · Chats · Alerts (badge) · Listings
          Buyer tabs:  Prices · Market · Chats · Profile
          Kisan Dost:  floating button on Prices / Crop detail / Market
```

| From | Action | To |
| --- | --- | --- |
| Prices | crop row / calculator | Crop detail / Profit calculator |
| Crop detail | Set alert / Estimate profit / Ask AI | Alert form / Profit / AI advice |
| Alerts | + New / tap card | Alert form (new / edit) |
| Marketplace | filter / card | Filter sheet / Listing detail |
| Listing detail | Call / WhatsApp / Chat / (owner) Edit | Phone / WhatsApp / In-app chat / Sell form |
| My Listings | + Sell produce / Edit / Mark sold | Sell form / status update |

---

## 🏗️ Architecture

```
Expo app ── useResource(path) / api.get|post|patch|del
   │        Authorization: Bearer <Convex JWT from Better Auth>
   ▼
https://<deployment>.convex.site/api/v1/...        (convex/rest/*.ts)
   │  zod validation · access check (signed in / profile / farmer / owner)
   ▼
Convex internal queries / mutations / actions ──► Convex tables
   │
   ├─ Bedrock (AI)  ├─ Groq Whisper (speech)  ├─ Resend (email)  └─ Cron (daily prices)
```

- After a write the app calls `invalidate(prefix)`, so cached lists refetch.
- Errors come back as `{ error: { code, message, field? } }`. Status codes: `400` bad input, `401` signed out, `403` profile incomplete / farmers only / not owner, `404` not found.
- Domain rules and zod schemas are shared between the app and the API in `convex/lib/kisan.ts`.

### REST API (`/api/v1`)

| Collection | Endpoints |
| --- | --- |
| users | `GET /users/me`, `PATCH /users/me` |
| crops | `GET /crops` |
| markets | `GET /markets` |
| prices | `GET /prices`, `GET /prices/history`, `GET /prices/compare` |
| alerts | `GET /alerts` (re-evaluates), `POST /alerts`, `PATCH/DELETE /alerts/:id` |
| listings | `GET /listings`, `GET /listings/mine`, `POST /listings`, `PATCH/DELETE /listings/:id` |
| AI | `POST /ai/advice`, `POST /ai/parse-listing` |
| assistant | `GET/POST /assistant/threads`, `GET /assistant/threads/:id`, `POST /assistant/messages`, `POST /assistant/confirm` |
| chat | `GET/POST /conversations`, `GET /conversations/counts`, `GET/POST /conversations/:id/...`, `POST/DELETE /messages/:id`, `POST /chat/upload-url` |

### Database

| Table | Key fields |
| --- | --- |
| `users` | authId, name, contactEmail, phone, district, role (Farmer/Buyer), marketId, emailAlerts |
| `crops` | name, nameUr, nameSd, category, icon |
| `markets` | name, nameUr, nameSd, district |
| `prices` | cropId, marketId, date, price |
| `listings` | userId, cropId, quantity, askingPrice, district, grade, availableFrom, contactPhone, status |
| `alerts` | userId, cropId, marketId, condition (Above/Below), targetPrice, active, lastTriggeredOn |
| `conversations` | listingId, buyerId, farmerId, lastMessage, lastMessageAt, unread counts, archived flags |
| `messages` | conversationId, senderId, type, body, storageId, durationMs, offer, readAt, deletedFor |
| `blocks` / `reports` | blocked users and reported chats |
| `adviceCache` | cached AI advice per crop / market / day |

Better Auth's own tables (`user`, `account`, `session`, `verification`, `jwks`) live in the `betterAuth` Convex component.

---

## 📂 Project structure

```
src/app/
├── _layout.tsx             root stack, fonts, AuthProvider, signed-in/out guards
├── welcome.tsx             onboarding slides
├── profile-setup.tsx       register · log in · Google · verify code · forgot/reset password · edit profile
├── (tabs)/                 prices · marketplace · chats · alerts · listings · profile
├── crop/[cropId].tsx       14-day chart, min/max/avg, market comparison, AI advice
├── listing/[id].tsx        listing detail, Call / WhatsApp / Chat
├── chat/[id].tsx           WhatsApp-style chat screen
├── assistant.tsx           Kisan Dost AI assistant
├── alert-form.tsx          create / edit price alert
├── sell.tsx                create / edit listing (voice fill)
└── profit.tsx              profit calculator with ±20% what-if

src/components/kisan/       UI kit: ui, text-field, tap, floating-tab-bar, chart, sheets
src/lib/api/                REST client, cached resources, response types
src/hooks/                  use-voice-input (record → Whisper)

convex/
├── schema.ts               all tables and indexes
├── rest/                   routes.ts · chat_routes.ts · assistant_routes.ts · helpers.ts
├── lib/kisan.ts            shared business rules + zod schemas + districts
├── assistant.ts            Kisan Dost agent and tools
├── conversations.ts, messages.ts   buyer ↔ farmer chat
├── ai.ts, advice.ts        Bedrock / Groq actions
├── email.ts                Resend emails
├── auth.ts                 Better Auth config (email + Google)
├── seed.ts                 demo data
└── crons.ts                daily price roll
```

---

## 🚀 Getting started

```bash
npm install
npx convex dev                 # keep running: pushes the backend and regenerates types
npx convex run seed:run        # seed crops, markets, 14 days of prices, users, listings, alerts
npx expo start                 # start the app (press "a" for Android, "w" for web)
npx expo run:android           # native dev build (needed for Google sign-in, mic, camera)
```

Expo Go is not enough because the app uses native modules. Use a development build (`npx expo run:android` or `npx eas-cli@latest build --profile development`).

Useful seed commands:
```bash
npx convex run seed:run '{"reset":true}'                       # reseed from scratch
npx convex run seed:adoptDemo '{"email":"you@example.com"}'    # give your account the demo listings/alerts
```

### Environment

The app's public values (the two Convex URLs) live in `app.json` → `expo.extra` (`convexUrl`, `convexSiteUrl`) and are read with `expo-constants` in `src/lib/config.ts`; there is no `.env` file. Point them at your own deployment (`npx convex dashboard` shows both URLs). **Secrets live only in Convex**, never in `app.json` or app code:

```bash
npx convex env set GROQ_API_KEY ...           # Whisper speech to text
npx convex env set AWS_ACCESS_KEY_ID ...      # Bedrock
npx convex env set AWS_SECRET_ACCESS_KEY ...
npx convex env set AWS_REGION us-east-1
npx convex env set RESEND_API_KEY ...         # emails
npx convex env set RESEND_FROM_EMAIL ...
# Google OAuth + Better Auth variables: see docs/auth-setup.md
```

### Checks

```bash
npm run typecheck     # app + convex TypeScript
npm run lint          # expo lint
npm test              # unit tests for business rules (tests/*.test.mjs)
npx expo-doctor
```

---

## 📚 Docs

- [docs/plan.md](docs/plan.md): full plan, status per milestone and roadmap
- [docs/auth-setup.md](docs/auth-setup.md): Better Auth, Google OAuth and Resend setup
- [docs/ai-bedrock.md](docs/ai-bedrock.md): Bedrock models and configuration
- [docs/ai-groq-voice.md](docs/ai-groq-voice.md): Groq chat, Whisper and text to speech

---

## 📝 Notes

- Prices are in **Rs per 40 kg (maund)** and "today" is calculated in **Pakistan time**.
- All seed data (names, phone numbers, prices) is **fictional**.
- Built for a 5.5-hour hackathon with Expo, Convex and AI coding assistants.
