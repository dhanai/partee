# In-app ads (AdMob)

Uses [`react-native-google-mobile-ads`](https://github.com/invertase/react-native-google-mobile-ads) with the Expo config plugin in `app.json`.

## Placements

1. **Discover** — A **native** ad row is inserted **inline** in the Discover feed after every **18** round cards (see `DISCOVER_NATIVE_AD_EVERY_N_ROUNDS` in `lib/parfade-admob.ts`). If there are **fewer than 18** rounds, one ad row is still added **at the end** of the list. Rows scroll with the list; no Discover interstitial. Optionally a **house promo** (your store URL) can replace a **percentage** of those ad slots — see `lib/discover-house-ad.ts` and `EXPO_PUBLIC_DISCOVER_HOUSE_*` in `.env.example`.
2. **Game finished** — Full-screen interstitial after **Mark complete** succeeds; when the ad closes (or fails to load), the app opens the **game recap** on the same session (`recap=1`), not the Games tab.

## Setup

1. In [AdMob](https://apps.admob.com/), create an app and:
   - One **native** ad unit for Discover (iOS + Android).
   - **Interstitial** ad units for game-end (iOS + Android) — separate units keep reporting clean.
2. Replace the **sample App IDs** in `app.json` → `react-native-google-mobile-ads` plugin with your real `ca-app-pub-…~…` values for iOS and Android.
3. Set in EAS / `.env` (see `apps/mobile/.env.example`):
   - `EXPO_PUBLIC_ADMOB_NATIVE_DISCOVER_IOS` / `_ANDROID`
   - `EXPO_PUBLIC_ADMOB_INTERSTITIAL_GAME_END_IOS` / `_ANDROID`  
   If unset, **Google test IDs** are used for native (Discover) and interstitial (game end) in development.
4. **Rebuild native apps** (`expo prebuild` / EAS Build). Ads do not run on web or in Expo Go.

## Disable

`EXPO_PUBLIC_ADS_DISABLED=1` — no SDK calls from our code (still rebuild if you remove the plugin).

## Consent / privacy

For production in regulated regions, plan for [UMP / consent](https://developers.google.com/admob/ump/android/quick-start) and App Store privacy labels; this repo only wires basic placements.
