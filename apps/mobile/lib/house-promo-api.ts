import { apiGet } from "./api";

export type HousePromoSlotClient = {
  enabled: boolean;
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
  return Boolean(
    slot.enabled &&
      slot.targetUrl?.trim() &&
      slot.mediaUrl?.trim() &&
      (slot.mediaKind === "image" || slot.mediaKind === "video"),
  );
}
