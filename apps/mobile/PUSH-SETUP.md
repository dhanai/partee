# Push notifications (round invites)

Partee sends **round invite** pushes via **Expo’s service** from your Next API (`lib/notify-user.ts` → `lib/push-expo.ts`). The **invitee’s** app must register an **Expo push token**; the API must have **`EXPO_ACCESS_TOKEN`**.

## What you do once (Expo / EAS)

1. **Log in** (local machine):

   ```bash
   cd apps/mobile
   npx expo login
   ```

2. **Link the app to an EAS project** (writes `expo.extra.eas.projectId` into `app.json`):

   ```bash
   npx eas init
   ```

   If `projectId` stays empty, push token registration in the app **does nothing** (`register-expo-push.ts`).

3. **Build a dev client** (push + native modules; Expo Go alone is limiting for real device push):

   ```bash
   npx eas build --profile development --platform ios
   # and/or
   npx eas build --profile development --platform android
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
