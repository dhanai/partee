import type { GameHoleRow } from "./games-api";

type RawSkins = {
  result?: string;
  winnerUserIds?: string[];
};

export type SkinsTieHandling = "carry" | "wash";

/**
 * Skins totals with optional carry: walk holes 1..holesCount in order.
 * - Sole low (`won` + one winner): that player gets 1 + carry, then carry resets to 0.
 * - Tied low (`tie`): carry += 1 if tieHandling is "carry"; carry resets to 0 if "wash".
 */
export function computeSkinsTotals(
  holes: GameHoleRow[],
  playerUserIds: string[],
  tieHandling: SkinsTieHandling,
  holesCount: number,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const id of playerUserIds) totals[id] = 0;

  const byHole = new Map<number, GameHoleRow>();
  for (const h of holes) {
    if (h.holeNumber >= 1 && h.holeNumber <= holesCount) {
      byHole.set(h.holeNumber, h);
    }
  }

  let carry = 0;
  for (let n = 1; n <= holesCount; n++) {
    const h = byHole.get(n);
    if (!h) continue;
    const p = h.payload as RawSkins;
    const r = p?.result === "carry" ? "tie" : p?.result;
    const ids = Array.isArray(p?.winnerUserIds) ? p.winnerUserIds : [];

    if (r === "won") {
      if (ids.length !== 1) continue;
      const w = ids[0];
      if (w && totals[w] !== undefined) {
        totals[w] += 1 + carry;
      }
      carry = 0;
    } else if (r === "tie") {
      if (tieHandling === "carry") carry += 1;
      else carry = 0;
    }
  }

  return totals;
}
