/**
 * Discover “house” promo: API-driven (admin) with env-based fallback.
 */

import type { HousePromoSlotClient } from "./house-promo-api";

function stableBucket0to99(slotId: string): number {
  let h = 0;
  for (let i = 0; i < slotId.length; i++) {
    h = (Math.imul(31, h) + slotId.charCodeAt(i)) >>> 0;
  }
  return h % 100;
}

export type DiscoverAdDisplay = {
  targetUrl: string;
  title: string;
  subtitle: string;
  cta: string;
  mediaUrl: string | null;
  mediaKind: "image" | "video" | null;
  mixPercent: number;
};

export function discoverHouseStoreUrl(): string | null {
  const u = process.env.EXPO_PUBLIC_DISCOVER_HOUSE_STORE_URL?.trim();
  return u || null;
}

export function discoverHouseAdPercent(): number {
  const n = Number(process.env.EXPO_PUBLIC_DISCOVER_HOUSE_AD_PCT ?? "0");
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100, Math.max(0, n));
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

/** Merge admin Discover slot with legacy env when API slot is off or incomplete. */
export function resolveDiscoverAdDisplay(remote: HousePromoSlotClient | null): DiscoverAdDisplay | null {
  if (
    remote?.enabled &&
    remote.targetUrl?.trim() &&
    remote.discoverMixPercent > 0
  ) {
    return {
      targetUrl: remote.targetUrl.trim(),
      title: remote.title?.trim() || "Promo",
      subtitle: remote.subtitle?.trim() || "",
      cta: remote.ctaLabel?.trim() || "Open",
      mediaUrl: remote.mediaUrl?.trim() || null,
      mediaKind: remote.mediaKind === "image" || remote.mediaKind === "video" ? remote.mediaKind : null,
      mixPercent: Math.min(100, Math.max(0, remote.discoverMixPercent)),
    };
  }
  const pct = discoverHouseAdPercent();
  const u = discoverHouseStoreUrl();
  if (pct <= 0 || !u) return null;
  const c = discoverHouseAdCopy();
  return {
    targetUrl: u,
    title: c.title,
    subtitle: c.subtitle,
    cta: c.cta,
    mediaUrl: c.imageUrl,
    mediaKind: c.imageUrl ? "image" : null,
    mixPercent: pct,
  };
}

export function shouldShowDiscoverHouseAd(slotId: string, display: DiscoverAdDisplay | null): boolean {
  if (!display) return false;
  return stableBucket0to99(slotId) < display.mixPercent;
}
