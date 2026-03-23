import { and, count, countDistinct, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  gameHoleEvents,
  gameSessionPlayers,
  gameSessions,
  rounds,
  spots,
} from "@/db/schema";
import type { SkinsHolePayload, WolfHolePayload } from "@/lib/games/payload-schemas";
import { computeWolfTotalsFromHoles, type WolfTieHandling } from "@/lib/games/wolf-scoring-totals";

export type UserStatsPayload = {
  wolfGamesCompleted: number;
  loneWolfHolesWon: number;
  partnerWolfHolesWon: number;
  packHolesWon: number;
  wolfTieHoles: number;
  wolfPointsTotal: number;
  skinsGamesCompleted: number;
  skinsHolesWon: number;
  skinsTieHoles: number;
  /** Rounds you host (forming / confirmed / completed). */
  roundsHostedCompleted: number;
  /** Distinct rounds you joined with a confirmed spot, not as host (same statuses). */
  roundsJoinedCompleted: number;
  /** Distinct rounds hosted or joined (same statuses). */
  roundsPlayedCompleted: number;
  /** Distinct courses on those rounds (non-null course only). */
  distinctCoursesPlayed: number;
  gamesCreatedCompleted: number;
  holesLogged: number;
};

function wolfTieFromSettings(settings: Record<string, unknown>): WolfTieHandling {
  const raw = settings?.wolfTieHandling;
  return raw === "wash" ? "wash" : "carry";
}

function isWolfPayload(p: Record<string, unknown>): p is WolfHolePayload {
  return typeof p?.wolfUserId === "string" && typeof p?.outcome === "string";
}

function isSkinsPayload(p: Record<string, unknown>): p is SkinsHolePayload {
  return (p?.result === "won" || p?.result === "tie") && Array.isArray(p?.winnerUserIds);
}

/** Profile “Parfade” counts include active rounds; we do not require `rounds.status = completed` (that flow is optional / legacy). */
const ROUND_STATUSES_FOR_SOCIAL_STATS = ["forming", "confirmed", "completed"] as const;

/**
 * Aggregates Parfade activity for the profile stats landing (completed **game sessions**;
 * rounds use forming/confirmed/completed for hosted/joined/course counts).
 */
export async function buildUserStats(userId: string): Promise<UserStatsPayload> {
  const [
    hostedCompleted,
    joinedCompleted,
    gamesCreatedRow,
    holesLoggedRow,
    coursesFromHosted,
    coursesFromJoined,
  ] = await Promise.all([
    db
      .select({ n: count() })
      .from(rounds)
      .where(and(eq(rounds.hostId, userId), inArray(rounds.status, ROUND_STATUSES_FOR_SOCIAL_STATS))),
    db
      .select({ n: countDistinct(spots.roundId) })
      .from(spots)
      .innerJoin(rounds, eq(spots.roundId, rounds.id))
      .where(
        and(
          eq(spots.userId, userId),
          eq(spots.status, "confirmed"),
          inArray(rounds.status, ROUND_STATUSES_FOR_SOCIAL_STATS),
          ne(rounds.hostId, userId),
        ),
      ),
    db
      .select({ n: count() })
      .from(gameSessions)
      .where(and(eq(gameSessions.createdBy, userId), eq(gameSessions.status, "completed"))),
    db
      .select({ n: count() })
      .from(gameHoleEvents)
      .where(eq(gameHoleEvents.recordedBy, userId)),
    db
      .selectDistinct({ courseId: rounds.courseId })
      .from(rounds)
      .where(
        and(
          eq(rounds.hostId, userId),
          inArray(rounds.status, ROUND_STATUSES_FOR_SOCIAL_STATS),
          isNotNull(rounds.courseId),
        ),
      ),
    db
      .selectDistinct({ courseId: rounds.courseId })
      .from(spots)
      .innerJoin(rounds, eq(spots.roundId, rounds.id))
      .where(
        and(
          eq(spots.userId, userId),
          eq(spots.status, "confirmed"),
          inArray(rounds.status, ROUND_STATUSES_FOR_SOCIAL_STATS),
          isNotNull(rounds.courseId),
        ),
      ),
  ]);

  const playedSessions = await db
    .select({
      id: gameSessions.id,
      gameType: gameSessions.gameType,
      settings: gameSessions.settings,
    })
    .from(gameSessionPlayers)
    .innerJoin(gameSessions, eq(gameSessionPlayers.sessionId, gameSessions.id))
    .where(and(eq(gameSessionPlayers.userId, userId), eq(gameSessions.status, "completed")));

  const createdSessions = await db
    .select({
      id: gameSessions.id,
      gameType: gameSessions.gameType,
      settings: gameSessions.settings,
    })
    .from(gameSessions)
    .where(and(eq(gameSessions.createdBy, userId), eq(gameSessions.status, "completed")));

  const sessionMap = new Map<
    string,
    { id: string; gameType: string; settings: Record<string, unknown> }
  >();
  for (const r of playedSessions) {
    sessionMap.set(r.id, {
      id: r.id,
      gameType: r.gameType,
      settings: (r.settings ?? {}) as Record<string, unknown>,
    });
  }
  for (const r of createdSessions) {
    if (!sessionMap.has(r.id)) {
      sessionMap.set(r.id, {
        id: r.id,
        gameType: r.gameType,
        settings: (r.settings ?? {}) as Record<string, unknown>,
      });
    }
  }

  const sessionIds = [...sessionMap.keys()];
  let wolfGamesCompleted = 0;
  let skinsGamesCompleted = 0;
  let loneWolfHolesWon = 0;
  let partnerWolfHolesWon = 0;
  let packHolesWon = 0;
  let wolfTieHoles = 0;
  let wolfPointsTotal = 0;
  let skinsHolesWon = 0;
  let skinsTieHoles = 0;

  if (sessionIds.length > 0) {
    const [allHoles, playerRows] = await Promise.all([
      db
        .select({
          sessionId: gameHoleEvents.sessionId,
          holeNumber: gameHoleEvents.holeNumber,
          payload: gameHoleEvents.payload,
        })
        .from(gameHoleEvents)
        .where(inArray(gameHoleEvents.sessionId, sessionIds)),
      db
        .select({
          sessionId: gameSessionPlayers.sessionId,
          userId: gameSessionPlayers.userId,
        })
        .from(gameSessionPlayers)
        .where(inArray(gameSessionPlayers.sessionId, sessionIds)),
    ]);

    const playersBySession = new Map<string, string[]>();
    for (const row of playerRows) {
      const list = playersBySession.get(row.sessionId) ?? [];
      list.push(row.userId);
      playersBySession.set(row.sessionId, list);
    }

    const holesBySession = new Map<string, { holeNumber: number; payload: Record<string, unknown> }[]>();
    for (const h of allHoles) {
      const list = holesBySession.get(h.sessionId) ?? [];
      list.push({ holeNumber: h.holeNumber, payload: h.payload as Record<string, unknown> });
      holesBySession.set(h.sessionId, list);
    }

    for (const [sid, meta] of sessionMap) {
      const holes = holesBySession.get(sid) ?? [];
      const playerIds = playersBySession.get(sid) ?? [];

      if (meta.gameType === "wolf") {
        wolfGamesCompleted += 1;
        const tieHandling = wolfTieFromSettings(meta.settings);
        const wolfRows = holes.map((h) => ({ holeNumber: h.holeNumber, payload: h.payload }));
        const totals = computeWolfTotalsFromHoles(wolfRows, playerIds, tieHandling);
        wolfPointsTotal += Math.round(totals[userId] ?? 0);

        for (const h of holes) {
          const p = h.payload;
          if (!isWolfPayload(p)) continue;
          if (p.outcome === "tie") {
            wolfTieHoles += 1;
            continue;
          }
          const wolf = p.wolfUserId;
          const alone = Boolean(p.wentAlone);
          const partner = p.partnerUserId ?? null;
          const wolfTeam = new Set<string>([wolf]);
          if (!alone && partner) wolfTeam.add(partner);

          if (p.outcome === "wolf_won") {
            if (alone && wolf === userId) loneWolfHolesWon += 1;
            else if (!alone && (wolf === userId || partner === userId)) partnerWolfHolesWon += 1;
          } else if (p.outcome === "pack_won") {
            if (!wolfTeam.has(userId)) packHolesWon += 1;
          }
        }
      } else if (meta.gameType === "skins") {
        skinsGamesCompleted += 1;
        for (const h of holes) {
          const p = h.payload;
          if (!isSkinsPayload(p)) continue;
          if (p.result === "tie") {
            skinsTieHoles += 1;
            continue;
          }
          if (p.result === "won" && p.winnerUserIds.length === 1 && p.winnerUserIds[0] === userId) {
            skinsHolesWon += 1;
          }
        }
      }
    }
  }

  const roundsHostedCompleted = Number(hostedCompleted[0]?.n ?? 0);
  const roundsJoinedCompleted = Number(joinedCompleted[0]?.n ?? 0);
  const hostedRoundIds = await db
    .select({ id: rounds.id })
    .from(rounds)
    .where(and(eq(rounds.hostId, userId), inArray(rounds.status, ROUND_STATUSES_FOR_SOCIAL_STATS)));
  const joinedRoundIds = await db
    .select({ roundId: spots.roundId })
    .from(spots)
    .innerJoin(rounds, eq(spots.roundId, rounds.id))
    .where(
      and(
        eq(spots.userId, userId),
        eq(spots.status, "confirmed"),
        inArray(rounds.status, ROUND_STATUSES_FOR_SOCIAL_STATS),
        ne(rounds.hostId, userId),
      ),
    );
  const distinctRoundIds = new Set<string>();
  for (const r of hostedRoundIds) distinctRoundIds.add(r.id);
  for (const r of joinedRoundIds) distinctRoundIds.add(r.roundId);
  const roundsPlayedCompleted = distinctRoundIds.size;

  const courseIdSet = new Set<string>();
  for (const r of coursesFromHosted) {
    if (r.courseId) courseIdSet.add(r.courseId);
  }
  for (const r of coursesFromJoined) {
    if (r.courseId) courseIdSet.add(r.courseId);
  }
  const distinctCoursesPlayed = courseIdSet.size;

  return {
    wolfGamesCompleted,
    loneWolfHolesWon,
    partnerWolfHolesWon,
    packHolesWon,
    wolfTieHoles,
    wolfPointsTotal,
    skinsGamesCompleted,
    skinsHolesWon,
    skinsTieHoles,
    roundsHostedCompleted,
    roundsJoinedCompleted,
    roundsPlayedCompleted,
    distinctCoursesPlayed,
    gamesCreatedCompleted: Number(gamesCreatedRow[0]?.n ?? 0),
    holesLogged: Number(holesLoggedRow[0]?.n ?? 0),
  };
}
