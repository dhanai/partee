import { db } from "@/db";
import { housePromoConfig } from "@/db/schema";

export type HousePromoSlotKey = "discover" | "gameEnd";

export type HousePromoSlotDto = {
  enabled: boolean;
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
    targetUrl: null,
    mediaUrl: null,
    mediaKind: null,
    title: "",
    subtitle: "",
    ctaLabel: "",
    discoverMixPercent: 0,
  };
}

function rowToDto(r: {
  enabled: boolean;
  targetUrl: string | null;
  mediaUrl: string | null;
  mediaKind: string | null;
  title: string | null;
  subtitle: string | null;
  ctaLabel: string | null;
  discoverMixPercent: number | null;
}): HousePromoSlotDto {
  const kind = r.mediaKind;
  return {
    enabled: Boolean(r.enabled),
    targetUrl: r.targetUrl?.trim() || null,
    mediaUrl: r.mediaUrl?.trim() || null,
    mediaKind: kind === "image" || kind === "video" ? kind : null,
    title: r.title?.trim() ?? "",
    subtitle: r.subtitle?.trim() ?? "",
    ctaLabel: r.ctaLabel?.trim() ?? "",
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
  await db
    .insert(housePromoConfig)
    .values({
      slot,
      enabled: next.enabled,
      targetUrl: next.targetUrl,
      mediaUrl: next.mediaUrl,
      mediaKind: next.mediaKind,
      title: next.title,
      subtitle: next.subtitle,
      ctaLabel: next.ctaLabel,
      discoverMixPercent: mix,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: housePromoConfig.slot,
      set: {
        enabled: next.enabled,
        targetUrl: next.targetUrl,
        mediaUrl: next.mediaUrl,
        mediaKind: next.mediaKind,
        title: next.title,
        subtitle: next.subtitle,
        ctaLabel: next.ctaLabel,
        discoverMixPercent: mix,
        updatedAt: new Date(),
      },
    });
}
