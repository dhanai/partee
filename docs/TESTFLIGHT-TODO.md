# TestFlight prep — checklist

**Full instructions:** [TESTFLIGHT-GUIDE.md](./TESTFLIGHT-GUIDE.md) (step-by-step).  
Use this file as a quick **checkbox**; keep the guide as the source of truth.

## Must-fix (shipping builds)

- [ ] **EAS secrets:** `EXPO_PUBLIC_API_BASE_URL` = **HTTPS** production API (no localhost); `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` = **live** key → then **rebuild** IPA.
- [ ] **Vercel / host env:** `DATABASE_URL`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, migrations applied; `EXPO_ACCESS_TOKEN` for pushes; Places keys if using search/photos.
- [ ] **Clerk:** production instance, redirect URLs + **bundle ID** + scheme `parfade` aligned with `apps/mobile/app.json`.
- [ ] **App Store Connect:** bundle ID matches `app.json`; version/build bumped per upload.

## Security / abuse

- [ ] Rate-limit or auth-gate heavy **public** routes (Places search / course photo) — see guide §9.
- [ ] **Clerk webhook** → production URL + **`CLERK_WEBHOOK_SECRET`** for prod.

## Reliability / polish

- [ ] Optional: mobile root **ErrorBoundary** + retry.
- [ ] **TestFlight:** privacy labels, photo/camera/location/calendar disclosures vs actual behavior.

## UX (your follow-ups)

- [ ] _(add here)_
