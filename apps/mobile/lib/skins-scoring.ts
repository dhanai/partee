import type { GameHoleRow } from "./games-api";

type RawSkins = {
  result?: string;
  winnerUserIds?: string[];
};

/** Count skins won per player (holes with result `won` and a single winner). */
export function computeSkinsWins(
  holes: GameHoleRow[],
  playerUserIds: string[],
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const id of playerUserIds) totals[id] = 0;

  for (const h of holes) {
    const p = h.payload as RawSkins;
    const r = p?.result === "carry" ? "tie" : p?.result;
    if (r !== "won") continue;
    const ids = p?.winnerUserIds;
    if (!Array.isArray(ids) || ids.length !== 1) continue;
    const w = ids[0];
    if (w && totals[w] !== undefined) totals[w] += 1;
  }
  return totals;
}
