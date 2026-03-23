import type { ConfigContext, ExpoConfig } from "expo/config";

/** Google’s sample publisher prefix — if only this is set, real ads won’t serve. */
const SAMPLE_APP_ID_SNIPPET = "3940256099942544";

function adMobPluginOpts(plugins: ExpoConfig["plugins"]): { androidAppId?: string; iosAppId?: string } | undefined {
  if (!plugins) return undefined;
  for (const p of plugins) {
    if (Array.isArray(p) && p[0] === "react-native-google-mobile-ads") {
      return p[1] as { androidAppId?: string; iosAppId?: string };
    }
  }
  return undefined;
}

function mergeAdMobAppIds(base: ExpoConfig): ExpoConfig {
  if (!base.plugins?.length) return base;
  const plugins = base.plugins.map((entry) => {
    if (Array.isArray(entry) && entry[0] === "react-native-google-mobile-ads") {
      const prev = (entry[1] ?? {}) as { androidAppId?: string; iosAppId?: string };
      return [
        "react-native-google-mobile-ads",
        {
          androidAppId:
            process.env.EXPO_PUBLIC_ADMOB_APP_ID_ANDROID?.trim() || prev.androidAppId,
          iosAppId: process.env.EXPO_PUBLIC_ADMOB_APP_ID_IOS?.trim() || prev.iosAppId,
        },
      ] as [string, { androidAppId?: string; iosAppId?: string }];
    }
    return entry;
  }) as ExpoConfig["plugins"];
  return { ...base, plugins };
}

/**
 * Fail EAS cloud builds early if required public env was not applied to the job.
 * (Avoids shipping an IPA that crashes or only shows the config error screen.)
 */
export default function appConfig({ config }: ConfigContext): ExpoConfig {
  let next = mergeAdMobAppIds({ ...(config as ExpoConfig) });

  if (process.env.EAS_BUILD === "true") {
    if (!process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim()) {
      throw new Error(
        "[EAS] Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY. Add it under Expo → Project → Environment variables for this build profile, then rebuild.",
      );
    }

    if (process.env.EAS_BUILD_PROFILE === "production") {
      const platform = process.env.EAS_BUILD_PLATFORM;
      if (platform === "ios") {
        if (!process.env.EXPO_PUBLIC_ADMOB_NATIVE_DISCOVER_IOS?.trim()) {
          throw new Error(
            "[EAS iOS production] Missing EXPO_PUBLIC_ADMOB_NATIVE_DISCOVER_IOS. " +
              "The JS bundle will fall back to Google TestIds → sample ads in TestFlight. " +
              "Add your native ad unit ID under Expo → Project → Environment variables (production), then rebuild.",
          );
        }
        if (!process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_GAME_END_IOS?.trim()) {
          throw new Error(
            "[EAS iOS production] Missing EXPO_PUBLIC_ADMOB_INTERSTITIAL_GAME_END_IOS. " +
              "Interstitials will use Google test units until this is set. Add it for production and rebuild.",
          );
        }
        const iosApp = adMobPluginOpts(next.plugins)?.iosAppId;
        if (iosApp?.includes(SAMPLE_APP_ID_SNIPPET)) {
          throw new Error(
            "[EAS iOS production] AdMob iOS App ID still uses Google’s sample app id (394025…). " +
              "Set EXPO_PUBLIC_ADMOB_APP_ID_IOS in EAS or replace iosAppId in app.json, then rebuild.",
          );
        }
      }
      if (platform === "android") {
        if (!process.env.EXPO_PUBLIC_ADMOB_NATIVE_DISCOVER_ANDROID?.trim()) {
          throw new Error(
            "[EAS Android production] Missing EXPO_PUBLIC_ADMOB_NATIVE_DISCOVER_ANDROID. Add your ad unit id and rebuild.",
          );
        }
        if (!process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_GAME_END_ANDROID?.trim()) {
          throw new Error(
            "[EAS Android production] Missing EXPO_PUBLIC_ADMOB_INTERSTITIAL_GAME_END_ANDROID. Add your ad unit id and rebuild.",
          );
        }
        const androidApp = adMobPluginOpts(next.plugins)?.androidAppId;
        if (androidApp?.includes(SAMPLE_APP_ID_SNIPPET)) {
          throw new Error(
            "[EAS Android production] AdMob Android App ID still uses Google’s sample id. " +
              "Set EXPO_PUBLIC_ADMOB_APP_ID_ANDROID in EAS or replace androidAppId in app.json.",
          );
        }
      }
    }
  }

  return next;
}
