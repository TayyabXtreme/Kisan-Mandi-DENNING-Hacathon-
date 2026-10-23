# Auth setup

KisanMandi uses Better Auth 1.6 through the `@convex-dev/better-auth`
component. Accounts support email/password registration, six-digit email
verification, login, Google OAuth, and password reset by email code.

Better Auth owns its `user`, `account`, `session`, and `verification` tables in
the `betterAuth` Convex component. Triggers in `convex/auth.ts` mirror each
identity into the app `users` table. Farmer/buyer profile data stays in the app
table and is accessed through `/api/v1/users/me`.

## Configuration

App values live in `app.json` → `expo.extra`, read with `expo-constants`
(`src/lib/config.ts`). Everything there is bundled into the app, so it holds
public values only:

| Key | Example | Purpose |
|---|---|---|
| `convexUrl` | `https://name.convex.cloud` | Convex client and JWT auth |
| `convexSiteUrl` | `https://name.convex.site` | Better Auth and REST endpoints |

Set backend values with `npx convex env set NAME value` or in the Convex
dashboard. Never put them in `app.json` or app code.

| Variable | Required | Purpose |
|---|---|---|
| `BETTER_AUTH_SECRET` | yes | Better Auth secret, at least 32 random characters |
| `SITE_URL` | yes | Web origin, such as `http://localhost:8081` in development |
| `RESEND_API_KEY` | yes | Sends verification, reset, and price-alert emails |
| `RESEND_FROM_EMAIL` | yes | Verified sender, such as `KisanMandi <alerts@example.com>` |
| `GOOGLE_CLIENT_ID` | for Google | Google OAuth web client ID |
| `GOOGLE_CLIENT_SECRET` | for Google | Google OAuth web client secret |

In Google Cloud Console, add this authorized redirect URI, using the active
Convex deployment:

```text
https://<deployment>.convex.site/api/auth/callback/google
```

The app scheme is `hackapp` in `app.json` and `convex/lib/app_info.ts`. Better
Auth trusts that scheme, and the Expo client converts relative OAuth callback
paths into deep links on iOS and Android.

## User flows

### Registration

1. The user enters their name, phone, email, password, district, and role in
   `src/app/profile-setup.tsx`.
2. The profile is saved temporarily in SecureStore, or localStorage on web.
   The password is never written to this draft.
3. `authClient.signUp.email()` creates the Better Auth user and credential
   account. Passwords must contain 8 to 128 characters.
4. Better Auth sends a six-digit verification code through Resend. The code
   expires after 10 minutes, is stored hashed, and allows five attempts.
5. `authClient.emailOtp.verifyEmail()` verifies the code and creates a session.
6. `src/app/index.tsx` sees the verified session, sends the saved profile to
   `PATCH /api/v1/users/me`, clears the draft, and opens Prices.

If the app closes after sign-up, the user can log in and request a new
verification code. The saved profile draft is completed after verification.

### Login

`authClient.signIn.email()` restores the existing account. An unverified user
is moved to the code screen and can request a new code. The Expo plugin stores
native session cookies in SecureStore, so app restarts keep the login.

### Google

`authClient.signIn.social({ provider: "google", callbackURL: "/" })` opens the
Google OAuth flow. The Expo plugin returns to the app through its deep link. A
new Google user is sent to profile setup to choose their phone, district, and
farmer/buyer role; an existing user goes directly to Prices.

### Forgot password

The login screen calls `authClient.emailOtp.requestPasswordReset()`. The user
enters the emailed code and a new password, then
`authClient.emailOtp.resetPassword()` changes the credential and revokes older
sessions. The response does not reveal whether an email is registered.

### Logout

The Profile tab calls `authClient.signOut()`. The account remains recoverable
through email/password or Google. The welcome screen remains marked as seen,
so the app returns to the registration/login screen. Clearing app storage or
reinstalling shows the welcome slides again.

## Session bridge

`src/providers/auth-provider.tsx` converts the Better Auth session into a
Convex JWT through `GET /api/auth/convex/token`. Keep its retry and watchdog
logic: native session restoration can finish before Convex accepts a fresh
token. The REST client reuses that JWT for `/api/v1` calls and clears its cache
when the Better Auth session changes.

Private Convex functions must call `const user = await requireUser(ctx)` and
use `user._id` for app-table ownership. Never accept a client-provided user ID
for authorization.

## Main files

| File | Responsibility |
|---|---|
| `convex/auth.ts` | Better Auth config, email OTP delivery, Google provider, and app-user triggers |
| `convex/http.ts` | Mounts Better Auth under `/api/auth/*` |
| `src/lib/auth-client.ts` | Expo, email OTP, Convex, and web cross-domain plugins |
| `src/providers/auth-provider.tsx` | Session state and Better Auth-to-Convex token bridge |
| `src/app/profile-setup.tsx` | Registration, login, verification, Google, reset, and profile form |
| `src/app/index.tsx` | Launch routing and profile-draft completion |
| `src/lib/profile-draft.ts` | Temporary profile data without credentials |

## Verification

Run these before shipping auth changes:

```bash
npx expo lint
npx tsc --noEmit
npx tsc --noEmit -p convex/tsconfig.json
npx expo-doctor
```

Manual checks:

- Fresh install: Welcome -> Create account -> verification code -> Prices.
- Existing account: Log in -> Prices.
- Unverified account: Log in -> verification screen -> Prices.
- Forgot password: request code -> reset -> log in with the new password.
- Google: new account -> profile completion; returning account -> Prices.
- Restart: the native SecureStore session is restored.
- Logout: registration/login appears and the account can be recovered.
