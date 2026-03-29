import type { GameHoleRow } from "./games-api";
import type { WolfPayload } from "./wolf-payload";

export type WolfTieHandling = "carry" | "wash";

/** Stake multiplier for this hole (from prior ties). */
export function wolfStakeMultiplierForHole(
  holesSortedAsc: GameHoleRow[],
  currentHole: number,
  tieHandling: WolfTieHandling,
): number {
  let m = 1;
  for (const row of holesSortedAsc) {
    if (row.holeNumber >= currentHole) break;
    const p = row.payload as WolfPayload;
    if (p?.outcome === "tie") {
      if (tieHandling === "carry") m += 1;
      // wash: m stays at 1
    } else {
      m = 1;
    }
  }
  return m;
}

/**
 * Points earned on one settled hole (not on ties). `stake` is the carry multiplier (1, 2, 3, …).
 *
 * **Lone wolf (4 players):** totals stay balanced — Team Wolf wins → +3×stake to wolf; Team Pack wins → +1×stake
 * to each of the three pack members (3×1 = 3 vs 3). Same pattern at 6 vs 2+2+2, 9 vs 3+3+3, etc.
 *
 * **Wolf + partner:** Team Wolf wins → wolf +1×stake, partner +1×stake; Team Pack wins → +1×stake to each
 * of the two other players (2 vs 2).
 */
function pointsForSettledHole(
  p: WolfPayload,
  stake: number,
  playerIds: string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of playerIds) out[id] = 0;

  if (p.outcome === "tie") return out;

  if (p.wentAlone) {
    if (p.outcome === "wolf_won") {
      out[p.wolfUserId] = (out[p.wolfUserId] ?? 0) + 3 * stake;
    } else {
      const pack = playerIds.filter((id) => id !== p.wolfUserId);
      for (const id of pack) out[id] = (out[id] ?? 0) + 1 * stake;
    }
    return out;
  }

  const partner = p.partnerUserId;
  if (!partner) return out;

  if (p.outcome === "wolf_won") {
    out[p.wolfUserId] = (out[p.wolfUserId] ?? 0) + 1 * stake;
    out[partner] = (out[partner] ?? 0) + 1 * stake;
  } else {
    const pack = playerIds.filter((id) => id !== p.wolfUserId && id !== partner);
    for (const id of pack) out[id] = (out[id] ?? 0) + 1 * stake;
  }
  return out;
}

/**
 * Running totals: ties = 0 for that hole; carry only affects the stake on later holes
 * (see `wolfStakeMultiplierForHole` per hole when recording).
 */
export function computeWolfTotals(
  holes: GameHoleRow[],
  playerUserIds: string[],
  tieHandling: WolfTieHandling,
): Record<string, number> {
  const sorted = [...holes].sort((a, b) => a.holeNumber - b.holeNumber);
  const totals: Record<string, number> = {};
  for (const id of playerUserIds) totals[id] = 0;

  for (const row of sorted) {
    const p = row.payload as WolfPayload;
    if (!p?.wolfUserId || !p.outcome) continue;
    const stake = wolfStakeMultiplierForHole(sorted, row.holeNumber, tieHandling);
    const delta = pointsForSettledHole(p, stake, playerUserIds);
    for (const id of playerUserIds) {
      totals[id] = (totals[id] ?? 0) + (delta[id] ?? 0);
    }
  }
  return totals;
}
