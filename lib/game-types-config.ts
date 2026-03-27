import { asc } from "drizzle-orm";
import { db } from "@/db";
import { gameTypes, type GameType } from "@/db/schema";

let cached: { rows: GameType[]; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

export async function getGameTypes(): Promise<GameType[]> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.rows;

  const rows = await db
    .select()
    .from(gameTypes)
    .orderBy(asc(gameTypes.sortOrder), asc(gameTypes.title));

  cached = { rows, expiresAt: now + CACHE_TTL_MS };
  return rows;
}

export async function getEnabledGameTypes(): Promise<GameType[]> {
  const all = await getGameTypes();
  return all.filter((g) => g.enabled);
}

export async function getGameTypeBySlug(slug: string): Promise<GameType | undefined> {
  const all = await getGameTypes();
  return all.find((g) => g.slug === slug);
}

export function invalidateGameTypesCache() {
  cached = null;
}

export type GameTypePublic = Pick<
  GameType,
  | "slug"
  | "title"
  | "subtitle"
  | "description"
  | "minPlayers"
  | "maxPlayers"
  | "holesOptions"
  | "scoringMode"
  | "standingsMode"
  | "hasTeams"
  | "teamFormation"
  | "settingsSchema"
  | "defaultSettings"
  | "sortOrder"
  | "enabled"
>;

export function toPublicGameType(g: GameType): GameTypePublic {
  return {
    slug: g.slug,
    title: g.title,
    subtitle: g.subtitle,
    description: g.description,
    minPlayers: g.minPlayers,
    maxPlayers: g.maxPlayers,
    holesOptions: g.holesOptions,
    scoringMode: g.scoringMode,
    standingsMode: g.standingsMode,
    hasTeams: g.hasTeams,
    teamFormation: g.teamFormation,
    settingsSchema: g.settingsSchema,
    defaultSettings: g.defaultSettings,
    sortOrder: g.sortOrder,
    enabled: g.enabled,
  };
}
