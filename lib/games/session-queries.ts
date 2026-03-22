import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  gameHoleEvents,
  gameSessionPlayers,
  gameSessions,
  users,
} from "@/db/schema";
import { mergeDbPlayersWithGuests, parseGuestPlayersFromSettings } from "@/lib/games/guest-players";

export async function userIsGameParticipant(sessionId: string, userId: string) {
  const [session] = await db
    .select({ createdBy: gameSessions.createdBy })
    .from(gameSessions)
    .where(eq(gameSessions.id, sessionId));
  if (!session) return false;
  if (session.createdBy === userId) return true;

  const [row] = await db
    .select({ id: gameSessionPlayers.id })
    .from(gameSessionPlayers)
    .where(
      and(
        eq(gameSessionPlayers.sessionId, sessionId),
        eq(gameSessionPlayers.userId, userId),
      ),
    );
  return Boolean(row);
}

export async function loadSessionWithPlayers(sessionId: string) {
  const [session] = await db.select().from(gameSessions).where(eq(gameSessions.id, sessionId));
  if (!session) return null;

  const dbPlayers = await db
    .select({
      userId: gameSessionPlayers.userId,
      sortOrder: gameSessionPlayers.sortOrder,
      teamId: gameSessionPlayers.teamId,
      name: users.name,
      avatar: users.avatar,
    })
    .from(gameSessionPlayers)
    .innerJoin(users, eq(gameSessionPlayers.userId, users.id))
    .where(eq(gameSessionPlayers.sessionId, sessionId))
    .orderBy(gameSessionPlayers.sortOrder, gameSessionPlayers.userId);

  const guests = parseGuestPlayersFromSettings(session.settings as Record<string, unknown>);
  const players = mergeDbPlayersWithGuests(dbPlayers, guests);

  const holes = await db
    .select()
    .from(gameHoleEvents)
    .where(eq(gameHoleEvents.sessionId, sessionId))
    .orderBy(gameHoleEvents.holeNumber);

  return { session, players, holes };
}

export async function listSessionsForUser(userId: string, limit = 50) {
  const created = await db
    .select({ id: gameSessions.id })
    .from(gameSessions)
    .where(eq(gameSessions.createdBy, userId));
  const played = await db
    .select({ sessionId: gameSessionPlayers.sessionId })
    .from(gameSessionPlayers)
    .where(eq(gameSessionPlayers.userId, userId));

  const idSet = new Set<string>();
  for (const r of created) idSet.add(r.id);
  for (const r of played) idSet.add(r.sessionId);
  const ids = [...idSet];
  if (ids.length === 0) return [];

  return db
    .select()
    .from(gameSessions)
    .where(inArray(gameSessions.id, ids))
    .orderBy(desc(gameSessions.updatedAt))
    .limit(limit);
}
