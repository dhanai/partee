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
      if (tieHandling === "carry") m *= 2;
      else m = 1;
    } else {
      m = 1;
    }
  }
  return m;
}

/** Points earned on one settled hole (not on ties). */
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
