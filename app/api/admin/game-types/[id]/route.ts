import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { gameTypes } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { isUserAdmin } from "@/lib/require-admin";
import { invalidateGameTypesCache, toPublicGameType } from "@/lib/game-types-config";

const settingsFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["select", "toggle"]),
  options: z.array(z.string()).optional(),
  default: z.union([z.string(), z.boolean()]).optional(),
});

const patchSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  subtitle: z.string().min(1).max(300).optional(),
  description: z.string().max(2000).optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  minPlayers: z.number().int().min(1).max(20).optional(),
  maxPlayers: z.number().int().min(1).max(20).optional(),
  holesOptions: z.array(z.number().int().min(1).max(27)).min(1).optional(),
  scoringMode: z.enum(["pick_lowest", "wolf_pick", "enter_strokes", "enter_dots", "enter_targets"]).optional(),
  standingsMode: z
    .enum(["skins_count", "wolf_points", "low_total", "stableford_points", "match_play", "nassau_match", "sixes_segments", "vegas_combined", "dots_total", "targets_count"])
    .optional(),
  hasTeams: z.boolean().optional(),
  teamFormation: z.enum(["fixed", "wolf_rotation", "rotating_sixes"]).nullable().optional(),
  settingsSchema: z.array(settingsFieldSchema).optional(),
  defaultSettings: z.record(z.string(), z.any()).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireDbUser(req);
    if (!isUserAdmin(user))
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });

    const patch = patchSchema.parse(await req.json());

    const [updated] = await db
      .update(gameTypes)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(gameTypes.id, params.id))
      .returning();

    if (!updated)
      return NextResponse.json({ error: "Game type not found." }, { status: 404 });

    invalidateGameTypesCache();
    return NextResponse.json({ ...toPublicGameType(updated), id: updated.id });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: "Invalid body.", issues: error.flatten() },
        { status: 400 },
      );
    if (error instanceof Error && error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[PATCH /api/admin/game-types/:id]", error);
    return NextResponse.json({ error: "Unable to update." }, { status: 500 });
  }
}
