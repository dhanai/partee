# TestFlight launch guide (Parfade mobile)

Step-by-step checklist for shipping the Expo app to **TestFlight**. Do sections in order where dependencies exist (e.g. API URL before you test the build).

---

## 1. Apple & Expo accounts

| Step | What to do |
|------|------------|
| 1.1 | **Apple Developer Program** membership active (paid). |
| 1.2 | **App Store Connect**: create an app record for Parfade (or confirm the existing one) with the **same bundle ID** you will use in `app.json` (see §4). |
| 1.3 | **Expo**: logged in (`npx eas-cli whoami`); project linked (`apps/mobile/app.json` → `extra.eas.projectId`). |

---

## 2. Production API (Vercel or your host)

The mobile app calls your Next.js API using **`EXPO_PUBLIC_API_BASE_URL`** (see `apps/mobile/lib/api.ts`). Real devices **cannot** use `localhost`.

| Step | What to do |
|------|------------|
| 2.1 | Deploy the **Next.js app** (repo root) to production; note the **HTTPS** origin (your custom domain or e.g. `https://your-app.vercel.app`, no trailing slash). |
| 2.2 | In the host’s **environment variables**, set at least: |

**Required for core app**

| Variable | Notes |
|----------|--------|
| `DATABASE_URL` | Neon (or other Postgres); run migrations on this DB (`npm run db:migrate` from repo root). |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk **live** publishable key. |
| `CLERK_SECRET_KEY` | Clerk **live** secret. |
| `CLERK_WEBHOOK_SECRET` | Secret for **production** Clerk webhook endpoint (see §6). |

**Strongly recommended**

| Variable | Notes |
|----------|--------|
| `EXPO_ACCESS_TOKEN` | Expo account [access token](https://expo.dev/accounts/_/settings/access-tokens) — server uses this to send **push** notifications (invites, etc.). Without it, API may work but pushes won’t send. |
| `GOOGLE_PLACES_API_KEY` | Server-side Places (course search, photos). Restrict key by IP / service in Google Cloud. |
| `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY` | If the web app uses Places in the browser. |

| Step | What to do |
|------|------------|
| 2.3 | After setting `DATABASE_URL`, run **`npm run db:migrate`** (and `npm run db:ensure-user-columns` if your checklist says so — see root `.env.example`). |
| 2.4 | Smoke-test production: open the deployed site, sign in, hit a few API flows (or `curl` a public health route if you add one). |

---

## 3. EAS environment variables (mobile build)

Values here are **baked into the JS bundle** at build time for `EXPO_PUBLIC_*`.

| Step | What to do |
|------|------------|
| 3.1 | From `apps/mobile`, set EAS secrets for the profile you use for TestFlight (usually **`production`**): |

```bash
cd apps/mobile
npx eas-cli secret:create --scope project --name EXPO_PUBLIC_API_BASE_URL --value "https://your-production-domain.com" --type string
npx eas-cli secret:create --scope project --name EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY --value "pk_live_..." --type string
```

| 3.2 | Confirm secrets: `npx eas-cli secret:list` (or Expo dashboard → project → Secrets). |
| 3.3 | **Rebuild** after changing secrets — old IPAs keep old env until you build again. |

**Local dev** can still use `apps/mobile/.env` / `.env.local`; EAS does not read those unless you wire `eas.json` `env` (optional).

### Crash immediately when opening TestFlight build?

Most often **`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` was not set for the EAS build** (or the profile you used didn’t inherit project env). The JS bundle then has no Clerk key; older builds **threw on launch** and iOS reported a crash. **New builds** show an in-app “Configuration needed” screen instead.

1. Expo dashboard → your project → **Environment variables** (or `eas env:list` / `eas secret:list`) and confirm **`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`** and **`EXPO_PUBLIC_API_BASE_URL`** exist for **production** (or the profile you build with).
2. Run **`eas build --profile production --platform ios`** again and submit the new build to TestFlight.
3. If it still crashes with **no** config screen, collect a device log (Xcode → Window → Devices and Simulators → open console while launching the app) and look for native/assertion errors — then compare with a known-good Expo SDK / plugin matrix.

---

## 4. iOS bundle ID, version, and native modules

| Step | What to do |
|------|------------|
| 4.1 | In **`apps/mobile/app.json`**, set `expo.ios.bundleIdentifier` to your **final** ID (e.g. `com.yourcompany.partee`). It must match **App Store Connect** and **Clerk** (below). The repo may show a placeholder like `com.anonymous.partee-mobile` — change before public TestFlight. |
| 4.2 | Bump **`expo.version`** (marketing version) and ensure **build number** increments each App Store upload (`expo.ios.buildNumber` or EAS `autoIncrement` — configure in `eas.json` if you want). |
| 4.3 | **`scheme`**: `partee` — used for deep links; any Clerk redirect URLs must allow this scheme (unchanged from TestFlight even if the app display name is Parfade). |
| 4.4 | Any **new native module** (e.g. `expo-calendar`) requires a **new native build**, not only an OTA update. |

---

## 5. Clerk (live keys + mobile)

| Step | What to do |
|------|------------|
| 5.1 | In Clerk **production** instance: enable the same auth methods you use in dev (email, Google, etc.). |
| 5.2 | **Publishable key** in EAS: `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` = **live** `pk_live_...` (not `pk_test_...`). |
| 5.3 | **Authorized redirect / native URLs** (Clerk dashboard): add your app’s **bundle ID** and **custom scheme** per [Clerk Expo docs](https://clerk.com/docs/quickstarts/expo). Typical entries include `partee://` OAuth callback paths Clerk expects for Expo. |
| 5.4 | If you use **Google OAuth**, add the **iOS client ID** / URL schemes Google requires for the bundle ID you ship. |
| 5.5 | After changing bundle ID or Clerk settings, do a **clean sign-up / sign-in** test on a release build. |

---

## 6. Clerk webhooks (production)

| Step | What to do |
|------|------------|
| 6.1 | In Clerk dashboard, point the **webhook** to your **production** URL (e.g. `https://your-api.com/api/webhooks/clerk` — use your real path). |
| 6.2 | Set **`CLERK_WEBHOOK_SECRET`** on the server to the **signing secret** for that webhook (separate from dev). |

---

## 7. Build and upload to TestFlight

| Step | What to do |
|------|------------|
| 7.1 | Install deps: `cd apps/mobile && npm install`. |
| 7.2 | **Production iOS build:** `npx eas-cli build --platform ios --profile production` |
| 7.3 | Wait for EAS to finish; download or use **Submit** flow. |
| 7.4 | **Submit to App Store Connect:** `npx eas-cli submit --platform ios --latest` (or upload the `.ipa` manually in Transporter). |
| 7.5 | In **App Store Connect**: add **TestFlight** testers, internal testing first, then external if needed (may require brief “export compliance” / encryption questions). |
| 7.6 | **Icon placeholder in Connect**: App Store Connect often keeps a generic listing icon until a **build is uploaded and tied to distribution** (e.g. first TestFlight build or a version with a binary). After that, the **icon from the IPA** usually appears—separate from the home-screen icon cache on device. |

---

## 8. App Store Connect metadata (compliance)

| Step | What to do |
|------|------------|
| 8.1 | **Privacy Nutrition Labels**: align with data you collect (account, location if used for Discover, photos if image picker uploads, etc.). |
| 8.2 | **Photo library** / **camera**: if `expo-image-picker` is used, declare usage strings; you already have location and calendar copy in `app.json` plugins. |
| 8.3 | **Encryption** (`ITSAppUsesNonExemptEncryption` / export): `app.json` sets `false` for standard HTTPS only — confirm that’s still accurate if you add custom crypto. |

---

## 9. Security / abuse (before wide beta)

These items limit cost and scraping on **public** API routes.

| Step | What to do |
|------|------------|
| 9.1 | Review unauthenticated endpoints that hit **Google Places** or heavy DB work, e.g. `POST /api/courses/search`, `POST /api/locations/search`, `GET /api/images/course-photo`. |
| 9.2 | Add **rate limiting** (middleware / edge) and/or **require auth** where acceptable. |
| 9.3 | Lock down **Google Cloud** API keys (HTTP referrer, IP, bundle ID where applicable). |

---

## 10. Optional polish (not blocking TestFlight)

| Item | Notes |
|------|--------|
| Root **ErrorBoundary** on mobile | Friendly error UI + retry instead of a white screen. |
| **CORS** | Only needed if you ship **Expo web** against an API on another origin in production; native apps don’t use browser CORS for API calls. |

---

## 11. Quick verification on a TestFlight build

1. Install build from TestFlight.  
2. **Sign in** (Clerk live).  
3. **Discover** loads (API URL correct).  
4. **Create / join / invite** round (DB + auth OK).  
5. **Push notification** path: trigger an invite (or follow) and confirm device receives notification if `EXPO_ACCESS_TOKEN` is set.  
6. **Add to calendar** on round detail (native `expo-calendar` present).  

---

## Reference files in this repo

| File | Purpose |
|------|---------|
| `apps/mobile/app.json` | Bundle ID, scheme, plugins, EAS project id |
| `apps/mobile/eas.json` | Build profiles (`production`, `preview`, `development`) |
| `apps/mobile/.env.example` | Local `EXPO_PUBLIC_*` template |
| `apps/mobile/lib/api.ts` | `EXPO_PUBLIC_API_BASE_URL` resolution |
| Root `.env.example` | Server env template + migration notes |
| `docs/TESTFLIGHT-TODO.md` | Short checkbox list (keep in sync with this guide) |

When a section is done, check it off in **`docs/TESTFLIGHT-TODO.md`** so the team has a single place to see progress.
