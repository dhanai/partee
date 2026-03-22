/**
 * Wolf recap copy using player names (not “Team Wolf / Team Pack”).
 * Keep in sync with `lib/games/wolf-recap-name-stats.ts` (Next API).
 */

export type WolfNameStatsAgg = {
  pairWins: Map<string, number>;
  packWins: Map<string, number>;
  lone: Map<string, { w: number; l: number; t: number }>;
  tieHoles: number;
};

type WolfLikePayload = {
  wolfUserId?: string;
  wentAlone?: boolean;
  partnerUserId?: string | null;
  outcome?: string;
};

export function firstName(full: string): string {
  const t = full.trim();
  if (!t) return "?";
  return t.split(/\s+/)[0] ?? t;
}

export function emptyWolfNameStats(): WolfNameStatsAgg {
  return {
    pairWins: new Map(),
    packWins: new Map(),
    lone: new Map(),
    tieHoles: 0,
  };
}

function ensureLone(agg: WolfNameStatsAgg, wolfId: string) {
  if (!agg.lone.has(wolfId)) {
    agg.lone.set(wolfId, { w: 0, l: 0, t: 0 });
  }
  return agg.lone.get(wolfId)!;
}

export function addHolesToWolfNameStats(
  agg: WolfNameStatsAgg,
  holes: ReadonlyArray<{ payload: Record<string, unknown> }>,
  playerUserIds: readonly string[],
): void {
  const rosterSorted = [...playerUserIds].sort();

  for (const row of holes) {
    const p = row.payload as WolfLikePayload;
    if (!p?.wolfUserId || !p?.outcome) continue;
    const wolf = p.wolfUserId;
    const partner = p.partnerUserId ?? null;

    if (p.outcome === "tie") {
      agg.tieHoles += 1;
      if (p.wentAlone) {
        ensureLone(agg, wolf).t += 1;
      }
      continue;
    }

    const packIds = rosterSorted.filter((id) => id !== wolf && id !== partner);

    if (p.outcome === "wolf_won") {
      if (p.wentAlone) {
        ensureLone(agg, wolf).w += 1;
      } else {
        if (!partner) continue;
        const key = [wolf, partner].sort().join("|");
        agg.pairWins.set(key, (agg.pairWins.get(key) ?? 0) + 1);
      }
    } else if (p.outcome === "pack_won") {
      const key = [...packIds].sort().join("|");
      if (key.length > 0) {
        agg.packWins.set(key, (agg.packWins.get(key) ?? 0) + 1);
      }
      if (p.wentAlone) {
        ensureLone(agg, wolf).l += 1;
      }
    }
  }
}

function formatNameList(ids: string[], nameByUserId: ReadonlyMap<string, string>): string {
  const parts = ids.map((id) => firstName(nameByUserId.get(id) ?? "?"));
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} & ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} & ${parts[parts.length - 1]!}`;
}

function sortMapByCountDesc(m: Map<string, number>): [string, number][] {
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export function wolfNameStatsToHighlightLines(
  agg: WolfNameStatsAgg,
  nameByUserId: ReadonlyMap<string, string>,
): string[] {
  const lines: string[] = [];

  for (const [key, n] of sortMapByCountDesc(agg.pairWins)) {
    if (n < 1) continue;
    const ids = key.split("|");
    const names = formatNameList(ids, nameByUserId);
    lines.push(
      `${names} won ${n} hole${n === 1 ? "" : "s"} together as wolf and partner.`,
    );
  }

  for (const [key, n] of sortMapByCountDesc(agg.packWins)) {
    if (n < 1) continue;
    const ids = key.split("|");
    const names = formatNameList(ids, nameByUserId);
    lines.push(
      `${names} won ${n} hole${n === 1 ? "" : "s"} when they beat the wolf.`,
    );
  }

  const loneEntries = [...agg.lone.entries()].filter(
    ([, v]) => v.w + v.l + v.t > 0,
  );
  loneEntries.sort((a, b) => {
    const ta = a[1].w + a[1].l + a[1].t;
    const tb = b[1].w + b[1].l + b[1].t;
    return tb - ta;
  });

  for (const [wolfId, v] of loneEntries) {
    const fn = firstName(nameByUserId.get(wolfId) ?? "?");
    const parts: string[] = [];
    if (v.w > 0) parts.push(`${v.w} win${v.w === 1 ? "" : "s"}`);
    if (v.l > 0) parts.push(`${v.l} loss${v.l === 1 ? "" : "es"}`);
    if (v.t > 0) parts.push(`${v.t} split${v.t === 1 ? "" : "s"}`);
    lines.push(`${fn} lone wolf: ${parts.join(", ")}.`);
  }

  return lines;
}

export function buildWolfNameRecapLinesForSession(
  holes: ReadonlyArray<{ payload: Record<string, unknown> }>,
  players: ReadonlyArray<{ userId: string; name: string }>,
): string[] {
  const agg = emptyWolfNameStats();
  const ids = players.map((p) => p.userId);
  addHolesToWolfNameStats(agg, holes, ids);
  const nameMap = new Map(players.map((p) => [p.userId, p.name]));
  return wolfNameStatsToHighlightLines(agg, nameMap);
}
