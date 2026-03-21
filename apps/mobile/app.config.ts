import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Fail EAS cloud builds early if required public env was not applied to the job.
 * (Avoids shipping an IPA that crashes or only shows the config error screen.)
 */
export default function appConfig({ config }: ConfigContext): ExpoConfig {
  if (process.env.EAS_BUILD === "true") {
    if (!process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim()) {
      throw new Error(
        "[EAS] Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY. Add it under Expo → Project → Environment variables for this build profile, then rebuild.",
      );
    }
  }
  return config as ExpoConfig;
}
