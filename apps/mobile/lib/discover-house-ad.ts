/**
 * Optional “house” promo in Discover ad slots (your store, etc.).
 * Mix is deterministic per slotId so rows don’t flicker on refresh.
 */

function stableBucket0to99(slotId: string): number {
  let h = 0;
  for (let i = 0; i < slotId.length; i++) {
    h = (Math.imul(31, h) + slotId.charCodeAt(i)) >>> 0;
  }
  return h % 100;
}

export function discoverHouseStoreUrl(): string | null {
  const u = process.env.EXPO_PUBLIC_DISCOVER_HOUSE_STORE_URL?.trim();
  return u || null;
}

/** 0–100: share of Discover *ad* rows that show the house promo instead of AdMob. */
export function discoverHouseAdPercent(): number {
  const n = Number(process.env.EXPO_PUBLIC_DISCOVER_HOUSE_AD_PCT ?? "0");
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100, Math.max(0, n));
}

export function shouldShowDiscoverHouseAd(slotId: string): boolean {
  const pct = discoverHouseAdPercent();
  if (pct <= 0) return false;
  if (!discoverHouseStoreUrl()) return false;
  return stableBucket0to99(slotId) < pct;
}

export function discoverHouseAdCopy(): {
  title: string;
  subtitle: string;
  cta: string;
  imageUrl: string | null;
} {
  return {
    title: process.env.EXPO_PUBLIC_DISCOVER_HOUSE_AD_TITLE?.trim() || "Parfade shop",
    subtitle:
      process.env.EXPO_PUBLIC_DISCOVER_HOUSE_AD_SUBTITLE?.trim() ||
      "Gear and extras from us — open in browser.",
    cta: process.env.EXPO_PUBLIC_DISCOVER_HOUSE_AD_CTA?.trim() || "Shop now",
    imageUrl: process.env.EXPO_PUBLIC_DISCOVER_HOUSE_AD_IMAGE_URL?.trim() || null,
  };
}
