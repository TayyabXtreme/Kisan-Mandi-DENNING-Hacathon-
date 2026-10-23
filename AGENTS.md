This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Project toolkit (already installed — use these before adding anything)

- **Backend:** Convex. Auth is Better Auth (email + password with code verification, Google). Better Auth's own tables (user, account, session…) live in the `betterAuth` component; triggers in `convex/auth.ts` mirror every user into the app `users` table. In private queries/mutations call `const user = await requireUser(ctx)` (`convex/users.ts`) and reference `user._id` (`Id<"users">`) from app tables. `api.users.me` returns the current profile. Do not edit the client auth bridge in `src/providers/auth-provider.tsx` without keeping its token retry.
- **AI:** `convex/ai.ts` → `api.ai.chat` action (`provider: "groq" | "bedrock"`), built on the Vercel AI SDK (`ai`, `@ai-sdk/groq`, `@ai-sdk/amazon-bedrock`). Keys live in Convex env only — never in the app or `app.json`. The app's public config (Convex URLs) is `app.json` → `extra`, read via `src/lib/config.ts` (`expo-constants`). Add new AI features as Convex actions in `convex/ai.ts` (`"use node"`). Speech to text: `api.ai.transcribe` (Groq Whisper), used through `src/hooks/use-voice-input.ts`. Bedrock models, config and examples: `docs/ai-bedrock.md`; Groq chat, Whisper and text-to-speech: `docs/ai-groq-voice.md`.
- **Icons:** `lucide-react-native` (preferred) and `@expo/vector-icons`.
- **UI:** NativeWind (Tailwind classes), `@gorhom/bottom-sheet`, `react-native-gifted-charts`, `expo-linear-gradient`, `expo-blur`, `expo-image`, `expo-haptics`.
- **Device:** `expo-camera`, `expo-image-picker`, `expo-document-picker`, `expo-file-system`, `expo-sharing`, `expo-clipboard`, `expo-audio` (record voice), `expo-speech` (text to speech). Permission strings are already in `app.json`.
- **Forms/state/utils:** `react-hook-form` + `zod` (use `src/lib/zod-resolver.ts`; do not install `@hookform/resolvers`), `zustand`, `date-fns`.
- **Fonts:** Inter (5 weights) loads behind the splash in `src/app/_layout.tsx`. Use `fontFamily: fonts.regular|medium|semibold|bold|extrabold` from `src/constants/fonts.ts`, never `fontWeight`; NativeWind: `font-sans`, `font-bold-inter`. Add weights via subpath imports only.
- **Avatars:** `<UserAvatar seed={user.authId} name image size />` (`src/components/user-avatar.tsx`): photo → DiceBear 10.x PNG (`dicebearUrl(seed, style)`) → initials.
- **Branding:** app name and URL scheme are in `convex/lib/app_info.ts` and `app.json`.
- **Onboarding / Welcome:** `src/app/welcome.tsx` — Reanimated swipe slides with animated dots; "seen" flag in `src/lib/welcome-seen.ts`, checked by `src/app/index.tsx`. Inside Reanimated worklets (`useAnimatedStyle`, scroll handlers) never call `.map`/`.filter` or other callbacks: the React Compiler (on in `app.json`) hoists them to plain JS functions and the UI thread crashes with "Tried to synchronously call a Remote Function"; precompute arrays outside the worklet.

## KisanMandi app structure

- **Data:** the app reads/writes only through the REST API in `convex/rest/routes.ts` (`/api/v1/...` on the `.convex.site` host). Client: `src/lib/api/client.ts` (`api.get/post/patch/del`), cached hooks in `src/lib/api/resources.ts` (`useResource`, `invalidate`), response types in `src/lib/api/types.ts`. Shared domain rules + zod schemas: `convex/lib/kisan.ts`. Seed: `npx convex run seed:run`.
- **MCP (ChatGPT / Claude):** `convex/rest/mcp.ts` is a hand-rolled, stateless MCP server at `/mcp/<km_ secret>` on the `.convex.site` host (read-only tools over the same internal queries as the REST API). Per-user secrets are stored hashed in `mcpKeys` (`convex/mcp_keys.ts`); the app screen is `src/app/connect-ai.tsx`.
- **UI kit:** `src/components/kisan/` (`ui.tsx`, `text-field.tsx`, `tap.tsx`, `hills-scene.tsx`, `floating-tab-bar.tsx`), colors in `src/constants/theme.ts`. Never use a Pressable `style={({ pressed }) => …}` callback — NativeWind drops it (invisible buttons); use `Tap` / `Button`.
- **Screens:** `welcome` → `profile-setup` → `(auth)` → `(tabs)/prices|marketplace|alerts|listings`, plus `crop/[cropId]`, `alert-form`, `listing/[id]`, `sell`, `profit`, `settings`. Design references live in `references/`.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files intall`.

<!-- convex-ai-end -->
