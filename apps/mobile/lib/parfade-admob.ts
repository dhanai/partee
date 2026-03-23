import { Platform } from "react-native";
import { AdEventType, InterstitialAd, MobileAds, TestIds } from "react-native-google-mobile-ads";

/** Inline native ad slot is inserted in the Discover list after every N round rows. */
export const DISCOVER_NATIVE_AD_EVERY_N_ROUNDS = 18;

let initPromise: Promise<void> | null = null;

function adsGloballyDisabled(): boolean {
  return process.env.EXPO_PUBLIC_ADS_DISABLED === "1";
}

export function isAdsDisabled(): boolean {
  return Platform.OS === "web" || adsGloballyDisabled();
}

/** Call once at startup (native only). Safe to call multiple times. */
export function initializeParfadeMobileAds(): void {
  if (Platform.OS === "web" || adsGloballyDisabled()) return;
  initPromise ??= MobileAds()
    .initialize()
    .then(() => undefined);
}

/** Await before loading NativeAd / InterstitialAd. */
export async function waitForAdsInit(): Promise<void> {
  if (Platform.OS === "web" || adsGloballyDisabled()) return;
  initializeParfadeMobileAds();
  if (initPromise) await initPromise;
}

export function discoverNativeAdUnitId(): string {
  if (Platform.OS === "web") return "";
  const ios = process.env.EXPO_PUBLIC_ADMOB_NATIVE_DISCOVER_IOS;
  const android = process.env.EXPO_PUBLIC_ADMOB_NATIVE_DISCOVER_ANDROID;
  const raw = Platform.OS === "ios" ? ios : Platform.OS === "android" ? android : null;
  if (raw?.trim()) return raw.trim();
  return TestIds.NATIVE;
}

function gameEndInterstitialUnitId(): string {
  const ios = process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_GAME_END_IOS;
  const android = process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_GAME_END_ANDROID;
  const raw = Platform.OS === "ios" ? ios : Platform.OS === "android" ? android : null;
  if (raw?.trim()) return raw.trim();
  return TestIds.INTERSTITIAL;
}

/**
 * Loads and shows one interstitial. Resolves when the ad is closed, fails, or after a timeout.
 */
export async function loadAndShowInterstitial(): Promise<void> {
  if (Platform.OS === "web" || adsGloballyDisabled()) return;
  try {
    await waitForAdsInit();
  } catch {
    return;
  }

  const unitId = gameEndInterstitialUnitId();
  const ad = InterstitialAd.createForAdRequest(unitId);

  await new Promise<void>((resolve) => {
    let finished = false;
    /** Once `show()` has run, never resolve on a timer — long ads + RN Modal under the ad caused black screens when we tore down early. */
    let interstitialWasPresented = false;
    let loadTimeoutId: ReturnType<typeof setTimeout> | undefined;

    const finish = () => {
      if (finished) return;
      finished = true;
      if (loadTimeoutId !== undefined) {
        clearTimeout(loadTimeoutId);
        loadTimeoutId = undefined;
      }
      resolve();
    };

    let unsubLoaded: (() => void) | undefined;
    let unsubClosed: (() => void) | undefined;
    let unsubError: (() => void) | undefined;

    const tearDown = () => {
      unsubLoaded?.();
      unsubClosed?.();
      unsubError?.();
      unsubLoaded = undefined;
      unsubClosed = undefined;
      unsubError = undefined;
    };

    loadTimeoutId = setTimeout(() => {
      if (!interstitialWasPresented) {
        tearDown();
        finish();
      }
    }, 45_000);

    unsubLoaded = ad.addAdEventListener(AdEventType.LOADED, () => {
      unsubLoaded?.();
      unsubLoaded = undefined;
      if (loadTimeoutId !== undefined) {
        clearTimeout(loadTimeoutId);
        loadTimeoutId = undefined;
      }
      try {
        ad.show();
        interstitialWasPresented = true;
      } catch {
        tearDown();
        finish();
      }
    });

    unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
      tearDown();
      finish();
    });

    unsubError = ad.addAdEventListener(AdEventType.ERROR, () => {
      tearDown();
      finish();
    });

    ad.load();
  });
}

/** After a game is marked completed on the server. */
export async function showGameFinishedInterstitialAd(): Promise<void> {
  await loadAndShowInterstitial();
}
