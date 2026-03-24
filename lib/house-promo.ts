import { db } from "@/db";
import { housePromoConfig } from "@/db/schema";

export type HousePromoSlotKey = "discover" | "gameEnd";

export type HousePromoAdDto = {
  targetUrl: string | null;
  mediaUrl: string | null;
  mediaKind: "image" | "video" | null;
  title: string;
  subtitle: string;
  ctaLabel: string;
};

export type HousePromoSlotDto = {
  enabled: boolean;
  /** Multiple ads per placement. First ad is currently used as active ad by runtime. */
  ads: HousePromoAdDto[];
  targetUrl: string | null;
  mediaUrl: string | null;
  mediaKind: "image" | "video" | null;
  title: string;
  subtitle: string;
  ctaLabel: string;
  /** Only used for Discover; ignored for game-end. */
  discoverMixPercent: number;
};

const SLOT_DB: Record<HousePromoSlotKey, string> = {
  discover: "discover_inline",
  gameEnd: "game_end_fullscreen",
};

function emptySlot(): HousePromoSlotDto {
  return {
    enabled: false,
    ads: [],
    targetUrl: null,
    mediaUrl: null,
    mediaKind: null,
    title: "",
    subtitle: "",
    ctaLabel: "",
    discoverMixPercent: 0,
  };
}

function normalizeAd(input: {
  targetUrl?: string | null;
  mediaUrl?: string | null;
  mediaKind?: string | null;
  title?: string | null;
  subtitle?: string | null;
  ctaLabel?: string | null;
}): HousePromoAdDto {
  const kind = input.mediaKind;
  return {
    targetUrl: input.targetUrl?.trim() || null,
    mediaUrl: input.mediaUrl?.trim() || null,
    mediaKind: kind === "image" || kind === "video" ? kind : null,
    title: input.title?.trim() ?? "",
    subtitle: input.subtitle?.trim() ?? "",
    ctaLabel: input.ctaLabel?.trim() ?? "",
  };
}

function parseAds(raw: unknown): HousePromoAdDto[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => (item && typeof item === "object" ? normalizeAd(item as Record<string, unknown>) : null))
    .filter((item): item is HousePromoAdDto => item !== null)
    .filter(
      (ad) =>
        Boolean(
          ad.targetUrl?.trim() ||
            ad.mediaUrl?.trim() ||
            ad.title.trim() ||
            ad.subtitle.trim() ||
            ad.ctaLabel.trim(),
        ),
    );
}

function deriveLegacyFromAds(ads: HousePromoAdDto[]): Pick<
  HousePromoSlotDto,
  "targetUrl" | "mediaUrl" | "mediaKind" | "title" | "subtitle" | "ctaLabel"
> {
  const first = ads[0];
  if (!first) {
    return {
      targetUrl: null,
      mediaUrl: null,
      mediaKind: null,
      title: "",
      subtitle: "",
      ctaLabel: "",
    };
  }
  return {
    targetUrl: first.targetUrl,
    mediaUrl: first.mediaUrl,
    mediaKind: first.mediaKind,
    title: first.title,
    subtitle: first.subtitle,
    ctaLabel: first.ctaLabel,
  };
}

function rowToDto(r: {
  enabled: boolean;
  ads: unknown;
  targetUrl: string | null;
  mediaUrl: string | null;
  mediaKind: string | null;
  title: string | null;
  subtitle: string | null;
  ctaLabel: string | null;
  discoverMixPercent: number | null;
}): HousePromoSlotDto {
  const ads = parseAds(r.ads);
  const fallbackFromLegacy = normalizeAd({
    targetUrl: r.targetUrl,
    mediaUrl: r.mediaUrl,
    mediaKind: r.mediaKind,
    title: r.title,
    subtitle: r.subtitle,
    ctaLabel: r.ctaLabel,
  });
  const finalAds =
    ads.length > 0
      ? ads
      : fallbackFromLegacy.targetUrl ||
          fallbackFromLegacy.mediaUrl ||
          fallbackFromLegacy.title ||
          fallbackFromLegacy.subtitle ||
          fallbackFromLegacy.ctaLabel
        ? [fallbackFromLegacy]
        : [];
  const legacy = deriveLegacyFromAds(finalAds);
  return {
    enabled: Boolean(r.enabled),
    ads: finalAds,
    targetUrl: legacy.targetUrl,
    mediaUrl: legacy.mediaUrl,
    mediaKind: legacy.mediaKind,
    title: legacy.title,
    subtitle: legacy.subtitle,
    ctaLabel: legacy.ctaLabel,
    discoverMixPercent: Math.min(100, Math.max(0, Number(r.discoverMixPercent ?? 0))),
  };
}

export async function loadHousePromosForApi(): Promise<{
  discover: HousePromoSlotDto;
  gameEnd: HousePromoSlotDto;
}> {
  const rows = await db.select().from(housePromoConfig);
  const bySlot = new Map(rows.map((r) => [r.slot, r]));
  const get = (key: HousePromoSlotKey): HousePromoSlotDto => {
    const r = bySlot.get(SLOT_DB[key]);
    return r ? rowToDto(r) : emptySlot();
  };
  return { discover: get("discover"), gameEnd: get("gameEnd") };
}

export async function saveHousePromoSlot(key: HousePromoSlotKey, next: HousePromoSlotDto): Promise<void> {
  const slot = SLOT_DB[key];
  const mix = key === "discover" ? next.discoverMixPercent : 0;
  const ads = next.ads.map((ad) => normalizeAd(ad));
  const legacy = deriveLegacyFromAds(ads);
  await db
    .insert(housePromoConfig)
    .values({
      slot,
      enabled: next.enabled,
      ads,
      targetUrl: legacy.targetUrl,
      mediaUrl: legacy.mediaUrl,
      mediaKind: legacy.mediaKind,
      title: legacy.title,
      subtitle: legacy.subtitle,
      ctaLabel: legacy.ctaLabel,
      discoverMixPercent: mix,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: housePromoConfig.slot,
      set: {
        enabled: next.enabled,
        ads,
        targetUrl: legacy.targetUrl,
        mediaUrl: legacy.mediaUrl,
        mediaKind: legacy.mediaKind,
        title: legacy.title,
        subtitle: legacy.subtitle,
        ctaLabel: legacy.ctaLabel,
        discoverMixPercent: mix,
        updatedAt: new Date(),
      },
    });
}
