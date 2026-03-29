import type { WolfHolePayload } from "@/lib/games/payload-schemas";

export type WolfTieHandling = "carry" | "wash";

export type WolfHoleRow = {
  holeNumber: number;
  payload: Record<string, unknown>;
};

function wolfStakeMultiplierForHole(
  holesSortedAsc: WolfHoleRow[],
  currentHole: number,
  tieHandling: WolfTieHandling,
): number {
  let m = 1;
  for (const row of holesSortedAsc) {
    if (row.holeNumber >= currentHole) break;
    const p = row.payload as WolfHolePayload;
    if (p?.outcome === "tie") {
      if (tieHandling === "carry") m += 1;
      // wash: m stays at 1
    } else {
      m = 1;
    }
  }
  return m;
}

function pointsForSettledHole(
  p: WolfHolePayload,
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

/** Same rules as the mobile Wolf scorer — for server-side round rollups. */
export function computeWolfTotalsFromHoles(
  holes: WolfHoleRow[],
  playerUserIds: string[],
  tieHandling: WolfTieHandling,
): Record<string, number> {
  const sorted = [...holes].sort((a, b) => a.holeNumber - b.holeNumber);
  const totals: Record<string, number> = {};
  for (const id of playerUserIds) totals[id] = 0;

  for (const row of sorted) {
    const p = row.payload as WolfHolePayload;
    if (!p?.wolfUserId || !p.outcome) continue;
    const stake = wolfStakeMultiplierForHole(sorted, row.holeNumber, tieHandling);
    const delta = pointsForSettledHole(p, stake, playerUserIds);
    for (const id of playerUserIds) {
      totals[id] = (totals[id] ?? 0) + (delta[id] ?? 0);
    }
  }
  return totals;
}

export function countWolfHoleOutcomes(holes: WolfHoleRow[]): {
  teamWolfHoles: number;
  teamPackHoles: number;
  tieHoles: number;
} {
  let teamWolfHoles = 0;
  let teamPackHoles = 0;
  let tieHoles = 0;
  for (const row of holes) {
    const p = row.payload as WolfHolePayload;
    const o = p?.outcome;
    if (o === "wolf_won") teamWolfHoles += 1;
    else if (o === "pack_won") teamPackHoles += 1;
    else if (o === "tie") tieHoles += 1;
  }
  return { teamWolfHoles, teamPackHoles, tieHoles };
}
