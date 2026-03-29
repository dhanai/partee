import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { gameTypes } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { isUserAdmin } from "@/lib/require-admin";
import {
  getGameTypes,
  invalidateGameTypesCache,
  toPublicGameType,
} from "@/lib/game-types-config";

const settingsFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["select", "toggle"]),
  options: z.array(z.string()).optional(),
  default: z.union([z.string(), z.boolean()]).optional(),
});

const createSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_]+$/, "Slug must be lowercase alphanumeric/underscores"),
  title: z.string().min(1).max(120),
  subtitle: z.string().min(1).max(300),
  description: z.string().max(2000).default(""),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  minPlayers: z.number().int().min(1).max(20).default(2),
  maxPlayers: z.number().int().min(1).max(20).default(8),
  holesOptions: z.array(z.number().int().min(1).max(27)).min(1).default([9, 18]),
  scoringMode: z.enum(["pick_lowest", "wolf_pick", "enter_strokes", "enter_dots", "enter_targets"]),
  standingsMode: z.enum(["skins_count", "wolf_points", "low_total", "stableford_points", "match_play", "nassau_match", "sixes_segments", "vegas_combined", "dots_total", "targets_count"]),
  hasTeams: z.boolean().default(false),
  teamFormation: z.enum(["fixed", "wolf_rotation", "rotating_sixes"]).nullable().default(null),
  settingsSchema: z.array(settingsFieldSchema).default([]),
  defaultSettings: z.record(z.string(), z.any()).default({}),
});

export async function GET(req: Request) {
  try {
    const user = await requireDbUser(req);
    if (!isUserAdmin(user))
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });

    const all = await getGameTypes();
    return NextResponse.json(all.map((g) => ({ ...toPublicGameType(g), id: g.id })));
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[GET /api/admin/game-types]", error);
    return NextResponse.json({ error: "Unable to load." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireDbUser(req);
    if (!isUserAdmin(user))
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });

    const body = createSchema.parse(await req.json());

    const [row] = await db
      .insert(gameTypes)
      .values({
        slug: body.slug,
        title: body.title,
        subtitle: body.subtitle,
        description: body.description,
        enabled: body.enabled,
        sortOrder: body.sortOrder,
        minPlayers: body.minPlayers,
        maxPlayers: body.maxPlayers,
        holesOptions: body.holesOptions,
        scoringMode: body.scoringMode,
        standingsMode: body.standingsMode,
        hasTeams: body.hasTeams,
        teamFormation: body.teamFormation,
        settingsSchema: body.settingsSchema,
        defaultSettings: body.defaultSettings,
      })
      .returning();

    invalidateGameTypesCache();
    return NextResponse.json({ ...toPublicGameType(row!), id: row!.id }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: "Invalid body.", issues: error.flatten() },
        { status: 400 },
      );
    if (error instanceof Error && error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "23505"
    )
      return NextResponse.json(
        { error: "A game type with that slug already exists." },
        { status: 409 },
      );
    console.error("[POST /api/admin/game-types]", error);
    return NextResponse.json({ error: "Unable to create." }, { status: 500 });
  }
}
