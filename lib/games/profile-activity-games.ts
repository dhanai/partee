import { and, desc, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import {
  gameSessionPlayers,
  gameSessions,
  profileGameSessionSettings,
  users,
} from "@/db/schema";
import { mergeDbPlayersWithGuests, parseGuestPlayersFromSettings } from "@/lib/games/guest-players";

export type ProfileGameActivityPlayerJson = {
  id: string;
  name: string;
  isGuest: boolean;
};

export type ProfileGameActivityJson = {
  sessionId: string;
  gameType: string;
  endedAt: string;
  isPinned: boolean;
  subject: ProfileGameActivityPlayerJson;
  others: ProfileGameActivityPlayerJson[];
};

type DbPlayerForSession = {
  userId: string;
  sortOrder: number;
  teamId: string | null;
  name: string;
  avatar: string | null;
};

/**
 * Completed game sessions for profile activity: profile user must be a DB player row (not guest-only).
 */
export async function getCompletedGameActivityForProfile(
  profileUserId: string,
  options: { endedBefore?: Date; limit: number },
): Promise<ProfileGameActivityJson[]> {
  const { endedBefore, limit } = options;

  const sessionWhere = and(
    eq(gameSessionPlayers.userId, profileUserId),
    eq(gameSessions.status, "completed"),
    isNotNull(gameSessions.endedAt),
    ...(endedBefore ? [lt(gameSessions.endedAt, endedBefore)] : []),
  );

  const sessionRows = await db
    .select({
      sessionId: gameSessions.id,
      gameType: gameSessions.gameType,
      endedAt: gameSessions.endedAt,
      settings: gameSessions.settings,
      feedPinned: profileGameSessionSettings.isPinned,
      settingsJoinId: profileGameSessionSettings.id,
    })
    .from(gameSessionPlayers)
    .innerJoin(gameSessions, eq(gameSessionPlayers.sessionId, gameSessions.id))
    .leftJoin(
      profileGameSessionSettings,
      and(
        eq(profileGameSessionSettings.userId, profileUserId),
        eq(profileGameSessionSettings.sessionId, gameSessions.id),
      ),
    )
    .where(
      and(
        sessionWhere,
        or(
          isNull(profileGameSessionSettings.id),
          eq(profileGameSessionSettings.hiddenOnProfile, false),
        ),
      ),
    )
    .orderBy(desc(gameSessions.endedAt))
    .limit(limit);

  if (sessionRows.length === 0) return [];

  const sessionIds = sessionRows.map((r) => r.sessionId);
  const sessionById = new Map(sessionRows.map((r) => [r.sessionId, r]));

  const dbPlayerRows = await db
    .select({
      sessionId: gameSessionPlayers.sessionId,
      userId: gameSessionPlayers.userId,
      sortOrder: gameSessionPlayers.sortOrder,
      teamId: gameSessionPlayers.teamId,
      name: users.name,
      avatar: users.avatar,
    })
    .from(gameSessionPlayers)
    .innerJoin(users, eq(gameSessionPlayers.userId, users.id))
    .where(inArray(gameSessionPlayers.sessionId, sessionIds))
    .orderBy(gameSessionPlayers.sortOrder, gameSessionPlayers.userId);

  const rowsBySession = new Map<string, DbPlayerForSession[]>();
  for (const row of dbPlayerRows) {
    const list = rowsBySession.get(row.sessionId) ?? [];
    list.push({
      userId: row.userId,
      sortOrder: row.sortOrder,
      teamId: row.teamId,
      name: row.name,
      avatar: row.avatar,
    });
    rowsBySession.set(row.sessionId, list);
  }

  const out: ProfileGameActivityJson[] = [];

  for (const sid of sessionIds) {
    const meta = sessionById.get(sid);
    if (!meta?.endedAt) continue;

    const dbRows = rowsBySession.get(sid) ?? [];
    const guests = parseGuestPlayersFromSettings(meta.settings as Record<string, unknown>);
    const merged = mergeDbPlayersWithGuests(dbRows, guests);

    const subjectRow = merged.find((p) => p.userId === profileUserId);
    if (!subjectRow) continue;

    const subject: ProfileGameActivityPlayerJson = {
      id: subjectRow.userId,
      name: subjectRow.name,
      isGuest: subjectRow.isGuest,
    };

    const others: ProfileGameActivityPlayerJson[] = merged
      .filter((p) => p.userId !== profileUserId)
      .map((p) => ({
        id: p.userId,
        name: p.name,
        isGuest: p.isGuest,
      }));

    out.push({
      sessionId: sid,
      gameType: meta.gameType,
      endedAt: meta.endedAt.toISOString(),
      isPinned: meta.feedPinned === true,
      subject,
      others,
    });
  }

  return out;
}
