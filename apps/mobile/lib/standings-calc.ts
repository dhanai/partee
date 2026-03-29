import type { GameHoleRow, GamePlayerRow } from "./games-api";

type HoleMap = Map<number, GameHoleRow>;

export type StandingsEntry = {
  userId: string;
  player: GamePlayerRow;
  value: number;
  label: string;
};

/** low_total: sum strokes, lowest wins */
export function calcLowTotal(
  players: GamePlayerRow[],
  holeMap: HoleMap,
  holesCount: number,
): StandingsEntry[] {
  const totals = new Map<string, number>();
  for (const p of players) totals.set(p.userId, 0);

  for (let h = 1; h <= holesCount; h++) {
    const hole = holeMap.get(h);
    if (!hole) continue;
    const scores = (hole.payload as { scores?: Record<string, number> })?.scores;
    if (!scores) continue;
    for (const [uid, s] of Object.entries(scores)) {
      totals.set(uid, (totals.get(uid) ?? 0) + s);
    }
  }

  return players
    .map((p) => ({
      userId: p.userId,
      player: p,
      value: totals.get(p.userId) ?? 0,
      label: String(totals.get(p.userId) ?? 0),
    }))
    .sort((a, b) => a.value - b.value);
}

/** stableford_points: convert strokes to points relative to par */
export function calcStableford(
  players: GamePlayerRow[],
  holeMap: HoleMap,
  holesCount: number,
  parPerHole: number,
): StandingsEntry[] {
  const totals = new Map<string, number>();
  for (const p of players) totals.set(p.userId, 0);

  for (let h = 1; h <= holesCount; h++) {
    const hole = holeMap.get(h);
    if (!hole) continue;
    const scores = (hole.payload as { scores?: Record<string, number> })?.scores;
    if (!scores) continue;
    for (const [uid, strokes] of Object.entries(scores)) {
      const diff = strokes - parPerHole;
      let pts = 0;
      if (diff <= -3) pts = 5;
      else if (diff === -2) pts = 4;
      else if (diff === -1) pts = 3;
      else if (diff === 0) pts = 2;
      else if (diff === 1) pts = 1;
      totals.set(uid, (totals.get(uid) ?? 0) + pts);
    }
  }

  return players
    .map((p) => ({
      userId: p.userId,
      player: p,
      value: totals.get(p.userId) ?? 0,
      label: `${totals.get(p.userId) ?? 0} pts`,
    }))
    .sort((a, b) => b.value - a.value);
}

/** match_play: holes won per player (head-to-head or multi) */
export function calcMatchPlay(
  players: GamePlayerRow[],
  holeMap: HoleMap,
  holesCount: number,
): StandingsEntry[] {
  const wins = new Map<string, number>();
  for (const p of players) wins.set(p.userId, 0);

  for (let h = 1; h <= holesCount; h++) {
    const hole = holeMap.get(h);
    if (!hole) continue;
    const scores = (hole.payload as { scores?: Record<string, number> })?.scores;
    if (!scores) continue;
    const entries = Object.entries(scores);
    if (entries.length === 0) continue;
    const minScore = Math.min(...entries.map(([, s]) => s));
    const winners = entries.filter(([, s]) => s === minScore);
    if (winners.length === 1) {
      const uid = winners[0]![0];
      wins.set(uid, (wins.get(uid) ?? 0) + 1);
    }
  }

  return players
    .map((p) => ({
      userId: p.userId,
      player: p,
      value: wins.get(p.userId) ?? 0,
      label: `${wins.get(p.userId) ?? 0} won`,
    }))
    .sort((a, b) => b.value - a.value);
}

/** nassau_match: front 9, back 9, overall match play */
export type NassauResult = {
  front: StandingsEntry[];
  back: StandingsEntry[];
  overall: StandingsEntry[];
};

export function calcNassauMatch(
  players: GamePlayerRow[],
  holeMap: HoleMap,
  holesCount: number,
): NassauResult {
  function winsInRange(start: number, end: number): Map<string, number> {
    const w = new Map<string, number>();
    for (const p of players) w.set(p.userId, 0);
    for (let h = start; h <= end; h++) {
      const hole = holeMap.get(h);
      if (!hole) continue;
      const scores = (hole.payload as { scores?: Record<string, number> })?.scores;
      if (!scores) continue;
      const entries = Object.entries(scores);
      if (entries.length === 0) continue;
      const minScore = Math.min(...entries.map(([, s]) => s));
      const winners = entries.filter(([, s]) => s === minScore);
      if (winners.length === 1) {
        const uid = winners[0]![0];
        w.set(uid, (w.get(uid) ?? 0) + 1);
      }
    }
    return w;
  }

  function toEntries(w: Map<string, number>): StandingsEntry[] {
    return players
      .map((p) => ({
        userId: p.userId,
        player: p,
        value: w.get(p.userId) ?? 0,
        label: `${w.get(p.userId) ?? 0} won`,
      }))
      .sort((a, b) => b.value - a.value);
  }

  const midpoint = Math.min(9, holesCount);
  return {
    front: toEntries(winsInRange(1, midpoint)),
    back: holesCount > 9 ? toEntries(winsInRange(midpoint + 1, holesCount)) : [],
    overall: toEntries(winsInRange(1, holesCount)),
  };
}

/** sixes_segments: rotating 2v2 best ball across 3 six-hole segments */
export type SixesResult = {
  segments: Array<{ label: string; teamAScore: number; teamBScore: number; teamAIds: string[]; teamBIds: string[] }>;
  playerWins: Map<string, number>;
};

export function calcSixesSegments(
  players: GamePlayerRow[],
  holeMap: HoleMap,
): SixesResult {
  if (players.length !== 4) {
    return { segments: [], playerWins: new Map() };
  }
  const ids = players.map((p) => p.userId);
  const pairings: Array<{ teamA: [string, string]; teamB: [string, string]; label: string; start: number; end: number }> = [
    { teamA: [ids[0]!, ids[1]!], teamB: [ids[2]!, ids[3]!], label: "Holes 1–6", start: 1, end: 6 },
    { teamA: [ids[0]!, ids[2]!], teamB: [ids[1]!, ids[3]!], label: "Holes 7–12", start: 7, end: 12 },
    { teamA: [ids[0]!, ids[3]!], teamB: [ids[1]!, ids[2]!], label: "Holes 13–18", start: 13, end: 18 },
  ];

  const playerWins = new Map<string, number>();
  for (const id of ids) playerWins.set(id, 0);

  const segments = pairings.map(({ teamA, teamB, label, start, end }) => {
    let teamAScore = 0;
    let teamBScore = 0;
    for (let h = start; h <= end; h++) {
      const hole = holeMap.get(h);
      if (!hole) continue;
      const scores = (hole.payload as { scores?: Record<string, number> })?.scores;
      if (!scores) continue;
      const bestA = Math.min(scores[teamA[0]] ?? 99, scores[teamA[1]] ?? 99);
      const bestB = Math.min(scores[teamB[0]] ?? 99, scores[teamB[1]] ?? 99);
      if (bestA < bestB) teamAScore++;
      else if (bestB < bestA) teamBScore++;
    }
    const winnerTeam = teamAScore > teamBScore ? teamA : teamBScore > teamAScore ? teamB : null;
    if (winnerTeam) {
      for (const id of winnerTeam) playerWins.set(id, (playerWins.get(id) ?? 0) + 1);
    }
    return { label, teamAScore, teamBScore, teamAIds: teamA, teamBIds: teamB };
  });

  return { segments, playerWins };
}

/** vegas_combined: combine team scores into two-digit numbers */
export type VegasEntry = {
  teamIds: string[];
  teamPlayers: GamePlayerRow[];
  totalPoints: number;
};

export function calcVegasCombined(
  players: GamePlayerRow[],
  holeMap: HoleMap,
  holesCount: number,
  birdieFlip: boolean,
  parPerHole: number,
): VegasEntry[] {
  if (players.length !== 4) return [];
  const teamA = [players[0]!, players[1]!];
  const teamB = [players[2]!, players[3]!];

  let teamAPoints = 0;
  let teamBPoints = 0;

  for (let h = 1; h <= holesCount; h++) {
    const hole = holeMap.get(h);
    if (!hole) continue;
    const scores = (hole.payload as { scores?: Record<string, number> })?.scores;
    if (!scores) continue;
    const sA0 = scores[teamA[0].userId] ?? 0;
    const sA1 = scores[teamA[1].userId] ?? 0;
    const sB0 = scores[teamB[0].userId] ?? 0;
    const sB1 = scores[teamB[1].userId] ?? 0;

    let numA = Math.min(sA0, sA1) * 10 + Math.max(sA0, sA1);
    let numB = Math.min(sB0, sB1) * 10 + Math.max(sB0, sB1);

    if (birdieFlip) {
      const aBirdie = sA0 < parPerHole || sA1 < parPerHole;
      const bBirdie = sB0 < parPerHole || sB1 < parPerHole;
      if (aBirdie && !bBirdie) numB = Math.max(sB0, sB1) * 10 + Math.min(sB0, sB1);
      if (bBirdie && !aBirdie) numA = Math.max(sA0, sA1) * 10 + Math.min(sA0, sA1);
    }

    teamAPoints += numB - numA;
    teamBPoints += numA - numB;
  }

  return [
    { teamIds: teamA.map((p) => p.userId), teamPlayers: teamA, totalPoints: teamAPoints },
    { teamIds: teamB.map((p) => p.userId), teamPlayers: teamB, totalPoints: teamBPoints },
  ].sort((a, b) => b.totalPoints - a.totalPoints);
}

/** dots_total: sum dot counts per player */
export function calcDotsTotal(
  players: GamePlayerRow[],
  holeMap: HoleMap,
  holesCount: number,
): StandingsEntry[] {
  const totals = new Map<string, number>();
  for (const p of players) totals.set(p.userId, 0);

  for (let h = 1; h <= holesCount; h++) {
    const hole = holeMap.get(h);
    if (!hole) continue;
    const dots = (hole.payload as { dots?: Record<string, string[]> })?.dots;
    if (!dots) continue;
    for (const [uid, achievements] of Object.entries(dots)) {
      totals.set(uid, (totals.get(uid) ?? 0) + achievements.length);
    }
  }

  return players
    .map((p) => ({
      userId: p.userId,
      player: p,
      value: totals.get(p.userId) ?? 0,
      label: `${totals.get(p.userId) ?? 0} dots`,
    }))
    .sort((a, b) => b.value - a.value);
}

/** targets_count: count target hits per player */
export function calcTargetsCount(
  players: GamePlayerRow[],
  holeMap: HoleMap,
  holesCount: number,
): StandingsEntry[] {
  const totals = new Map<string, number>();
  for (const p of players) totals.set(p.userId, 0);

  for (let h = 1; h <= holesCount; h++) {
    const hole = holeMap.get(h);
    if (!hole) continue;
    const hits = (hole.payload as { hits?: Record<string, boolean> })?.hits;
    if (!hits) continue;
    for (const [uid, hit] of Object.entries(hits)) {
      if (hit) totals.set(uid, (totals.get(uid) ?? 0) + 1);
    }
  }

  return players
    .map((p) => ({
      userId: p.userId,
      player: p,
      value: totals.get(p.userId) ?? 0,
      label: `${totals.get(p.userId) ?? 0} hits`,
    }))
    .sort((a, b) => b.value - a.value);
}
