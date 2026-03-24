import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDbUser } from "@/lib/auth";
import { loadHousePromosForApi, saveHousePromoSlot, type HousePromoSlotDto } from "@/lib/house-promo";
import { isUserAdmin } from "@/lib/require-admin";

const nullableUrl = z
  .union([z.string().url(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === "" || v === undefined ? undefined : v));

const mediaKindZ = z.enum(["image", "video"]).nullable().optional();

const adPatchZ = z.object({
  targetUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
  mediaUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
  mediaKind: mediaKindZ,
  title: z.string().max(200).optional(),
  subtitle: z.string().max(500).optional(),
  ctaLabel: z.string().max(80).optional(),
});

const slotPatchZ = z.object({
  enabled: z.boolean().optional(),
  ads: z.array(adPatchZ).max(20).optional(),
  targetUrl: nullableUrl,
  mediaUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
  mediaKind: mediaKindZ,
  title: z.string().max(200).optional(),
  subtitle: z.string().max(500).optional(),
  ctaLabel: z.string().max(80).optional(),
  discoverMixPercent: z.number().int().min(0).max(100).optional(),
});

const patchBodyZ = z.object({
  discover: slotPatchZ.optional(),
  gameEnd: slotPatchZ.optional(),
});

function forbidden(msg: string) {
  return NextResponse.json({ error: msg }, { status: 403 });
}

export async function GET(req: Request) {
  try {
    const user = await requireDbUser(req);
    if (!isUserAdmin(user)) {
      return forbidden("Not authorized.");
    }
    const data = await loadHousePromosForApi();
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[GET /api/admin/house-ads]", error);
    return NextResponse.json({ error: "Unable to load." }, { status: 500 });
  }
}

function applySlotPatch(base: HousePromoSlotDto, patch: z.infer<typeof slotPatchZ>): HousePromoSlotDto {
  const next = { ...base };
  if (patch.enabled !== undefined) next.enabled = patch.enabled;
  if (patch.ads !== undefined) {
    next.ads = patch.ads.map((ad) => ({
      targetUrl: ad.targetUrl === "" ? null : (ad.targetUrl ?? null),
      mediaUrl: ad.mediaUrl === "" ? null : (ad.mediaUrl ?? null),
      mediaKind: ad.mediaKind ?? null,
      title: ad.title?.trim() ?? "",
      subtitle: ad.subtitle?.trim() ?? "",
      ctaLabel: ad.ctaLabel?.trim() ?? "",
    }));
  }
  if (patch.targetUrl !== undefined) next.targetUrl = patch.targetUrl ?? null;
  if (patch.mediaUrl !== undefined) next.mediaUrl = patch.mediaUrl === "" ? null : patch.mediaUrl;
  if (patch.mediaKind !== undefined) next.mediaKind = patch.mediaKind ?? null;
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.subtitle !== undefined) next.subtitle = patch.subtitle;
  if (patch.ctaLabel !== undefined) next.ctaLabel = patch.ctaLabel;
  if (patch.discoverMixPercent !== undefined) next.discoverMixPercent = patch.discoverMixPercent;
  if (
    patch.ads === undefined &&
    (patch.targetUrl !== undefined ||
      patch.mediaUrl !== undefined ||
      patch.mediaKind !== undefined ||
      patch.title !== undefined ||
      patch.subtitle !== undefined ||
      patch.ctaLabel !== undefined)
  ) {
    const first = next.ads[0] ?? {
      targetUrl: null,
      mediaUrl: null,
      mediaKind: null,
      title: "",
      subtitle: "",
      ctaLabel: "",
    };
    next.ads = [
      {
        targetUrl: next.targetUrl ?? first.targetUrl,
        mediaUrl: next.mediaUrl ?? first.mediaUrl,
        mediaKind: next.mediaKind ?? first.mediaKind,
        title: next.title || first.title,
        subtitle: next.subtitle || first.subtitle,
        ctaLabel: next.ctaLabel || first.ctaLabel,
      },
      ...next.ads.slice(1),
    ];
  }
  return next;
}

export async function PATCH(req: Request) {
  try {
    const user = await requireDbUser(req);
    if (!isUserAdmin(user)) {
      return forbidden("Not authorized.");
    }
    const json = patchBodyZ.parse(await req.json());
    const current = await loadHousePromosForApi();
    if (json.discover) {
      await saveHousePromoSlot("discover", applySlotPatch(current.discover, json.discover));
    }
    if (json.gameEnd) {
      await saveHousePromoSlot("gameEnd", applySlotPatch(current.gameEnd, json.gameEnd));
    }
    const data = await loadHousePromosForApi();
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid body.", issues: error.flatten() },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[PATCH /api/admin/house-ads]", error);
    return NextResponse.json({ error: "Unable to save." }, { status: 500 });
  }
}
