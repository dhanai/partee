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

## Next steps

- Add Clerk Expo auth and JWT for protected API routes
- Port create round flow (planning + scheduled) to native
- Register device tokens and push notifications
