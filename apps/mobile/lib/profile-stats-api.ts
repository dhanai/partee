import { apiGet } from "./api";

/** Mirrors `ProfileStatCategoryId` / `ProfileStatsGrouped` from API. */
export type ProfileStatCategoryId = "wolf" | "skins" | "social";

/** One category block from GET …/stats (headline + drill-down rows). */
export type ProfileCategoryStatsBlock = {
  headline: string;
  headlineLabel: string;
  subtitle: string;
  highlights: { label: string; value: string }[];
  rows: { label: string; value: string }[];
};

export type ProfileStatsGrouped = Record<ProfileStatCategoryId, ProfileCategoryStatsBlock>;

export type UserStatsApiResponse = {
  stats: Record<string, number>;
  grouped: ProfileStatsGrouped;
};

function fmtInt(n: number): string {
  return n.toLocaleString();
}

function fmtSkinsAvgPerGame(games: number, skinsWon: number): string {
  if (games <= 0) return "—";
  const v = skinsWon / games;
  return Number.isInteger(v) ? fmtInt(v) : v.toFixed(1);
}

/**
 * Production may still run an older API that returns 3 skins highlights.
 * Flat `stats` from the same response always includes skins counts — append column + row.
 */
export function ensureSkinsFourthColumn(
  grouped: ProfileStatsGrouped,
  stats: Record<string, number> | undefined,
): ProfileStatsGrouped {
  if (!stats) return grouped;
  const skins = grouped.skins;
  const highlights = skins?.highlights ?? [];
  if (highlights.length >= 4) return grouped;
  if (highlights.length !== 3) return grouped;

  const games = Number(stats.skinsGamesCompleted ?? 0);
  const won = Number(stats.skinsHolesWon ?? 0);
  const avg = fmtSkinsAvgPerGame(games, won);

  const rows = skins.rows ?? [];
  const hasAvgRow = rows.some((r) => r.label.toLowerCase().includes("avg"));
  const nextRows = hasAvgRow
    ? rows
    : [...rows, { label: "Avg skins won per game", value: avg }];

  return {
    ...grouped,
    skins: {
      ...skins,
      highlights: [...highlights, { label: "Avg / game", value: avg }],
      rows: nextRows,
    },
  };
}

export async function fetchUserStats(
  token: string | null,
  userIdOrMe: "me" | string,
): Promise<UserStatsApiResponse> {
  const path =
    userIdOrMe === "me" ? "/api/users/me/stats" : `/api/users/${userIdOrMe}/stats`;
  return apiGet<UserStatsApiResponse>(path, token);
}
