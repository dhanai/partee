import { eq } from "drizzle-orm";
import { db } from "@/db";
import { gameSessions } from "@/db/schema";
import {
  addHolesToWolfNameStats,
  emptyWolfNameStats,
  wolfNameStatsToHighlightLines,
} from "@/lib/games/wolf-recap-name-stats";
import {
  computeWolfTotalsFromHoles,
  countWolfHoleOutcomes,
  type WolfHoleRow,
} from "@/lib/games/wolf-scoring-totals";
import { loadSessionWithPlayers } from "@/lib/games/session-queries";

export type RoundResultsPlayerRow = {
  userId: string;
  name: string;
  avatar: string | null;
  isGuest: boolean;
  wolfPoints: number;
};

export type RoundResultsWolfSummary = {
  completedSessions: number;
  holesRecorded: number;
  teamWolfHoleWins: number;
  teamPackHoleWins: number;
  tieHoles: number;
};

export type RoundResultsPayload = {
  wolfSummary: RoundResultsWolfSummary | null;
  standings: RoundResultsPlayerRow[];
  highlights: string[];
};

function firstName(full: string): string {
  const t = full.trim();
  if (!t) return "?";
  return t.split(/\s+/)[0] ?? t;
}

export async function buildRoundResultsPayload(
  roundId: string,
  roster: { userId: string; name: string; avatar: string | null; isGuest: boolean }[],
): Promise<RoundResultsPayload> {
  const sessions = await db
    .select({
      id: gameSessions.id,
      gameType: gameSessions.gameType,
      status: gameSessions.status,
    })
    .from(gameSessions)
    .where(eq(gameSessions.roundId, roundId));

  const rosterById = new Map(roster.map((p) => [p.userId, p]));
  const wolfPointsByUser = new Map<string, number>();
  for (const p of roster) wolfPointsByUser.set(p.userId, 0);

  let teamWolfHoleWins = 0;
  let teamPackHoleWins = 0;
  let tieHoles = 0;
  let holesRecorded = 0;
  let completedWolfSessions = 0;
  const nameAgg = emptyWolfNameStats();

  for (const s of sessions) {
    if (s.gameType !== "wolf" || s.status !== "completed") continue;
    completedWolfSessions += 1;
    const data = await loadSessionWithPlayers(s.id);
    if (!data) continue;

    const tieHandling =
      data.session.settings?.wolfTieHandling === "wash" ? "wash" : "carry";
    const holeRows: WolfHoleRow[] = data.holes.map((h) => ({
      holeNumber: h.holeNumber,
      payload: h.payload as Record<string, unknown>,
    }));
    holesRecorded += holeRows.length;

    const counts = countWolfHoleOutcomes(holeRows);
    teamWolfHoleWins += counts.teamWolfHoles;
    teamPackHoleWins += counts.teamPackHoles;
    tieHoles += counts.tieHoles;

    const playerIds = data.players.map((p) => p.userId);
    addHolesToWolfNameStats(nameAgg, holeRows, playerIds);
    const totals = computeWolfTotalsFromHoles(holeRows, playerIds, tieHandling);
    for (const pl of data.players) {
      const id = pl.userId;
      const add = totals[id] ?? 0;
      if (!rosterById.has(id)) {
        rosterById.set(id, {
          userId: id,
          name: pl.name,
          avatar: pl.avatar,
          isGuest: Boolean(pl.isGuest),
        });
        wolfPointsByUser.set(id, 0);
      }
      wolfPointsByUser.set(id, (wolfPointsByUser.get(id) ?? 0) + add);
    }
  }

  const mergedRoster = [...rosterById.values()];
  const standings: RoundResultsPlayerRow[] = mergedRoster.map((p) => ({
    ...p,
    wolfPoints: wolfPointsByUser.get(p.userId) ?? 0,
  }));
  standings.sort((a, b) => b.wolfPoints - a.wolfPoints);

  const highlights: string[] = [];

  const wolfSummary: RoundResultsWolfSummary | null =
    completedWolfSessions > 0
      ? {
          completedSessions: completedWolfSessions,
          holesRecorded,
          teamWolfHoleWins,
          teamPackHoleWins,
          tieHoles,
        }
      : null;

  if (completedWolfSessions === 0) {
    highlights.push("No completed Wolf games were linked to this round—try one next time.");
  } else {
    const nameById = new Map(mergedRoster.map((p) => [p.userId, p.name]));
    highlights.push(...wolfNameStatsToHighlightLines(nameAgg, nameById));
    const top = standings.filter((p) => p.wolfPoints > 0);
    if (top.length >= 2) {
      highlights.push(
        `${firstName(top[0]!.name)} & ${firstName(top[1]!.name)} led the Wolf points column.`,
      );
    } else if (top.length === 1) {
      highlights.push(`${firstName(top[0]!.name)} led Wolf points for this round.`);
    }
  }

  return { wolfSummary, standings, highlights };
}
