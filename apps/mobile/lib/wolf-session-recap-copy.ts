import type { GameHoleRow, GamePlayerRow } from "./games-api";
import {
  buildWolfNameRecapLinesForSession,
  firstName,
} from "./wolf-recap-name-stats";

export { firstName };

/** Hole-level outcomes (for tie count in snapshot chips). */
export function countWolfHoleOutcomes(holes: GameHoleRow[]): {
  teamWolfHoles: number;
  teamPackHoles: number;
  tieHoles: number;
} {
  let teamWolfHoles = 0;
  let teamPackHoles = 0;
  let tieHoles = 0;
  for (const row of holes) {
    const p = row.payload as { outcome?: string };
    const o = p?.outcome;
    if (o === "wolf_won") teamWolfHoles += 1;
    else if (o === "pack_won") teamPackHoles += 1;
    else if (o === "tie") tieHoles += 1;
  }
  return { teamWolfHoles, teamPackHoles, tieHoles };
}

export function buildWolfSessionRecapHighlights(
  holes: GameHoleRow[],
  players: GamePlayerRow[],
  wolfPointsByUserId: Record<string, number>,
): string[] {
  const highlights = buildWolfNameRecapLinesForSession(
    holes,
    players.map((p) => ({ userId: p.userId, name: p.name })),
  );

  const ranked = [...players]
    .map((p) => ({ p, pts: wolfPointsByUserId[p.userId] ?? 0 }))
    .filter((x) => x.pts > 0)
    .sort((a, b) => b.pts - a.pts);

  if (ranked.length >= 2) {
    highlights.push(
      `${firstName(ranked[0]!.p.name)} & ${firstName(ranked[1]!.p.name)} led the Wolf points.`,
    );
  } else if (ranked.length === 1) {
    highlights.push(`${firstName(ranked[0]!.p.name)} led Wolf points.`);
  }

  return highlights;
}
