# Mobile dev notes (EAS)

## API base URL (fixes “Network request failed” on a real phone)

On a **physical device**, `http://localhost:3000` is the **phone**, not your Mac. The app reads **`EXPO_PUBLIC_API_BASE_URL`** first (see `lib/api.ts`).

- **Local LAN:** In `apps/mobile/.env`, set e.g. `EXPO_PUBLIC_API_BASE_URL=http://192.168.x.x:3000` (your Mac’s IP). From the **repo root** run **`npm run dev:lan`** (or `npx next dev -H 0.0.0.0 -p 3000`) so Next listens on all interfaces — plain `next dev` often binds to `localhost` only, and another app on `:3000` can return **HTML 404** for `/api/...`. Restart Metro after env changes (`npx expo start -c`).
- **Intermittent HTML 404 on `/api/*` after things worked:** Often a corrupt `.next` dev cache (Next terminal may show `/_not-found` and webpack `ENOENT` / `vendor-chunks`). Stop Next, then from repo root: **`npm run dev:lan:clean`** (deletes `.next` and starts on `0.0.0.0:3000`).
- **No Mac / easiest:** Set `EXPO_PUBLIC_API_BASE_URL=https://your-app.vercel.app` in **`apps/mobile/.env`** for dev-client sessions, and add the same variable under **EAS → Project → Environment variables** for **development** builds so installs work without Metro.

## Calendar (`expo-calendar`) — `MissingCalendarPListValueException`

iOS **requires** usage strings in **Info.plist**. On **iOS 17+** the system looks for **`NSCalendarsFullAccessUsageDescription`** (and Expo Calendar also validates **reminders** keys). If they’re missing, you get a red screen / fatal at startup when the module loads.

`app.json` now sets these under **`expo.ios.infoPlist`** and **`expo-calendar`** `remindersPermission`. After changing them you must **regenerate the native project**: from `apps/mobile` run **`npx expo prebuild --clean`** (or **`npx expo run:ios`**, which runs prebuild) so the new keys are copied into the built app.

## Calendar — “Cannot find native module ‘ExpoCalendar’”

That error is **not about web vs sim** — it means the **native app you’re running** was built **without** the calendar native module linked (or you’re on a client that doesn’t include it).

- **Custom dev client** (`expo-dev-client`): After adding or changing `expo-calendar` / `app.json` plugins, run a **new native build** — e.g. `npx expo run:ios` from `apps/mobile`, or `eas build --profile development --platform ios` — then open the app from that install. An older dev client IPA won’t magically pick up new native modules.
- **Expo Go**: Use the **App Store Expo Go** version that matches your **SDK** (e.g. SDK 55). Then calendar should be available; simulator + Expo Go is supported for this module.
- **Round screen on web**: `expo-calendar` isn’t available in the browser; the app uses a **dynamic import** so the round page still loads; “Add to calendar” shows a short message on web.

---

# Push notifications (round invites)

Parfade sends **round invite**, **host RSVP**, and **group chat** pushes via **Expo’s service** from your Next API (`lib/notify-user.ts` → `lib/push-expo.ts`). The recipient’s app must register an **Expo push token**; the API must have **`EXPO_ACCESS_TOKEN`**.

**Tapping a notification:** `type: round_chat` + `inviteToken` opens **fullscreen group chat** (`/round/[inviteToken]/chat`). `round_invite` / `round_rsvp` open **round detail** (`/round/[inviteToken]`). See `lib/notification-deep-link.tsx`. Follow-request pushes open **Notifications**.

## No push after an invite? Check these first

1. **Physical device + dev client** — Remote push is unreliable on **iOS Simulator**; use a real phone with an **EAS dev client** or release build (not Expo Go-only workflows for full fidelity).
2. **`EXPO_ACCESS_TOKEN` on the Next server** — Without it, `sendExpoPushMessages` does nothing. Set it in `.env.local` (local API) or Vercel env (deployed API). Restart `next dev` after changing env.
3. **Invitee allowed notifications** — iOS Settings → Parfade → Notifications. The app registers the token only after permission is granted.
4. **Invitee signed in on the phone** — Token is POSTed to `/api/users/me/push-token` with a Clerk JWT. Open the app once while logged in (pull-to-refresh / foreground also re-runs registration).
5. **Same API URL** — Phone app’s `EXPO_PUBLIC_API_BASE_URL` must point at the same Next instance that has `EXPO_ACCESS_TOKEN` and that received the push-token POST.
6. **Debug logging** — On the API: `EXPO_DEBUG_PUSH=1`. You’ll see warnings when invitees have no stored token or when send is skipped.

## What you do once (Expo / EAS)

1. **Log in** (local machine):

   ```bash
   cd apps/mobile
   npx expo login
   ```

2. **Link the app to an EAS project** (writes `expo.extra.eas.projectId` into `app.json`):

   ```bash
   npx eas-cli init
   ```

   If `projectId` stays empty, push token registration in the app **does nothing** (`register-expo-push.ts`).

3. **Build a dev client** (push + native modules; Expo Go alone is limiting for real device push):

   ```bash
   npx eas-cli build --profile development --platform ios
   # and/or
   npx eas-cli build --profile development --platform android
   ```

   Install the build on a **physical device**. Use **iOS Simulator** only for UI—not for reliable remote push.

## What you do once (API)

4. Create an **Expo access token**: [expo.dev → Account → Access tokens](https://expo.dev/accounts/_/settings/access-tokens).

5. Set on the **Next.js server** (e.g. `.env.local`):

   ```env
   EXPO_ACCESS_TOKEN=your_token_here
   ```

   Leave unset only if you intentionally want no outbound push (`sendExpoPushMessages` no-ops).

6. Optional while debugging:

   ```env
   EXPO_DEBUG_PUSH=1
   ```

   Logs when invitees have **no stored token**, when push is **skipped** (no token / disabled), or when **Expo send** fails.

## How to test invite → push

1. **User B** (invitee): open the **dev build**, sign in, **allow notifications**.
2. Confirm **B** has `expo_push_token` in the DB (or enable `EXPO_DEBUG_PUSH=1` and send an invite—if B has no token you’ll see a warning).
3. **User A** creates a round and invites **B** (or uses add-invites on an existing round).
4. **B** should get a notification titled **“Round invite”**.

Sanity check without invites: paste B’s Expo token into [expo.dev/notifications](https://expo.dev/notifications).
