import { apiGet } from "./api";

export type HousePromoSlotClient = {
  enabled: boolean;
  ads?: Array<{
    targetUrl: string | null;
    mediaUrl: string | null;
    mediaKind: "image" | "video" | null;
    title: string;
    subtitle: string;
    ctaLabel: string;
  }>;
  targetUrl: string | null;
  mediaUrl: string | null;
  mediaKind: "image" | "video" | null;
  title: string;
  subtitle: string;
  ctaLabel: string;
  discoverMixPercent: number;
};

export type HousePromosPayload = {
  discover: HousePromoSlotClient;
  gameEnd: HousePromoSlotClient;
};

let cache: { at: number; data: HousePromosPayload } | null = null;
const TTL_MS = 60_000;

export async function getHousePromosCached(forceRefresh = false): Promise<HousePromosPayload> {
  if (!forceRefresh && cache && Date.now() - cache.at < TTL_MS) {
    return cache.data;
  }
  const data = await apiGet<HousePromosPayload>("/api/promo/house-ads", null);
  cache = { at: Date.now(), data };
  return data;
}

export function clearHousePromoCache(): void {
  cache = null;
}

export function isGameEndHousePromoReady(slot: HousePromoSlotClient): boolean {
  if (!slot.enabled) return false;
  if (
    slot.targetUrl?.trim() &&
    slot.mediaUrl?.trim() &&
    (slot.mediaKind === "image" || slot.mediaKind === "video")
  ) {
    return true;
  }
  if (slot.ads && slot.ads.length > 0) {
    return slot.ads.some(
      (a) =>
        a.targetUrl?.trim() &&
        a.mediaUrl?.trim() &&
        (a.mediaKind === "image" || a.mediaKind === "video"),
    );
  }
  return false;
}
