/**
 * Client-side fetch for public game types (same JSON as mobile /api/game-types).
 * Web game copy comes from GET /api/game-types (admin + DB), not static definitions.
 */
export type GameTypePublicRow = {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  holesOptions: number[];
  scoringMode: string;
  standingsMode: string;
  hasTeams: boolean;
  teamFormation: string | null;
  settingsSchema: unknown[];
  defaultSettings: Record<string, unknown>;
  sortOrder: number;
  enabled: boolean;
};

export async function fetchGameTypesPublic(): Promise<GameTypePublicRow[]> {
  const res = await fetch("/api/game-types", { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load game types.");
  return res.json() as Promise<GameTypePublicRow[]>;
}

export function findGameTypeBySlug(
  types: GameTypePublicRow[],
  slug: string,
): GameTypePublicRow | undefined {
  return types.find((g) => g.slug === slug);
}
