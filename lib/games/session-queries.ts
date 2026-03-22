import { and, desc, eq, exists, or } from "drizzle-orm";
import { db } from "@/db";
import {
  gameHoleEvents,
  gameSessionPlayers,
  gameSessions,
  users,
} from "@/db/schema";

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

  const players = await db
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

  const holes = await db
    .select()
    .from(gameHoleEvents)
    .where(eq(gameHoleEvents.sessionId, sessionId))
    .orderBy(gameHoleEvents.holeNumber);

  return { session, players, holes };
}

export async function listSessionsForUser(userId: string, limit = 50) {
  const asParticipant = db
    .select()
    .from(gameSessionPlayers)
    .where(
      and(
        eq(gameSessionPlayers.sessionId, gameSessions.id),
        eq(gameSessionPlayers.userId, userId),
      ),
    );

  return db
    .select()
    .from(gameSessions)
    .where(or(eq(gameSessions.createdBy, userId), exists(asParticipant)))
    .orderBy(desc(gameSessions.updatedAt))
    .limit(limit);
}
