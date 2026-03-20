# TestFlight prep & follow-ups

Checkpoint doc from pre–TestFlight audit. Update as you go.

## Must-fix (shipping builds)

- [ ] Set **`EXPO_PUBLIC_API_BASE_URL`** to **HTTPS** production/staging URL in **EAS** for the build profile used for TestFlight; rebuild IPA.
- [ ] Confirm **Vercel/hosting** env: `DATABASE_URL`, `CLERK_*`, `GOOGLE_PLACES_API_KEY` (if used), `EXPO_ACCESS_TOKEN` (pushes), etc.
- [ ] **Clerk + Google OAuth**: production/live keys, redirect URLs, iOS bundle ID + scheme `partee` aligned with final `app.json` identifier.

## Security / abuse

- [ ] **Rate-limit or auth-gate** unauthenticated routes: `POST /api/courses/search`, `POST /api/locations/search`, `GET /api/images/course-photo` (Places quota & egress).
- [ ] **Production webhook**: prod URL + dedicated `CLERK_WEBHOOK_SECRET`.
- [ ] Revisit **CORS** only if you ship **Expo Web** against a different origin than the API.

## Reliability / polish

- [ ] Optional: **root `ErrorBoundary`** on mobile (friendly fallback + retry).
- [ ] **TestFlight**: bump **version/build** each upload; confirm push entitlements + `EXPO_ACCESS_TOKEN` for invite notifications.
- [ ] **App Store Connect**: privacy labels, photo-library usage (image picker), encryption question consistency.

## UX (add your items below)

- [ ] _(add here)_
