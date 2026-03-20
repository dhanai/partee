# Partee Mobile (Expo)

## Run locally

1. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_BASE_URL`.
2. Install dependencies:
   - `npm install`
3. Start Expo:
   - `npm run start`

## Current scope

- Expo Router tabs foundation
- Discover screen wired to `GET /api/rounds/discover`
- Round details screen wired to:
  - `GET /api/rounds/:token`
  - `POST /api/rounds/:token/join`

## Push notifications

1. Create an [EAS project](https://docs.expo.dev/eas/) and set `expo.extra.eas.projectId` in `app.json` (or use `app.config.js` to inject it).
2. On the **Next.js** server, set `EXPO_ACCESS_TOKEN` (Expo access token) in `.env.local` so the API can send pushes via Expo’s service.
3. After sign-in, the app requests notification permission and registers the Expo push token with `POST /api/users/me/push-token`.

## Next steps

- Add Clerk Expo auth and JWT for protected API routes
- Port create round flow (planning + scheduled) to native
