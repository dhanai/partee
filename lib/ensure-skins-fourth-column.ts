import type { ProfileStatsGrouped } from "@/lib/user-stats-grouped";

function fmtInt(n: number): string {
  return n.toLocaleString();
}

function fmtSkinsAvgPerGame(games: number, skinsWon: number): string {
  if (games <= 0) return "—";
  const v = skinsWon / games;
  return Number.isInteger(v) ? fmtInt(v) : v.toFixed(1);
}

/** Match mobile: ensure 4th skins highlight when API returns 3. */
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
