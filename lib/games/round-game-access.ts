import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { rounds, spots, users } from "@/db/schema";

export type RoundAccessContext = {
  roundId: string;
  hostId: string;
  confirmedPlayerUserIds: string[];
};

/**
 * Returns round context if token exists. Caller must still verify viewer access.
 */
export async function getRoundByInviteToken(token: string) {
  const [round] = await db
    .select({
      id: rounds.id,
      hostId: rounds.hostId,
      inviteToken: rounds.inviteToken,
    })
    .from(rounds)
    .where(eq(rounds.inviteToken, token));
  return round ?? null;
}

/** Host or confirmed spot on the round. */
export async function viewerCanLinkGameToRound(
  roundId: string,
  viewerUserId: string,
): Promise<boolean> {
  const [asHost] = await db
    .select({ id: rounds.id })
    .from(rounds)
    .where(and(eq(rounds.id, roundId), eq(rounds.hostId, viewerUserId)));
  if (asHost) return true;

  const [asPlayer] = await db
    .select({ id: spots.id })
    .from(spots)
    .where(
      and(
        eq(spots.roundId, roundId),
        eq(spots.userId, viewerUserId),
        eq(spots.status, "confirmed"),
      ),
    );
  return Boolean(asPlayer);
}

export async function loadRoundGameAccessContext(
  roundId: string,
): Promise<RoundAccessContext | null> {
  const [round] = await db
    .select({ id: rounds.id, hostId: rounds.hostId })
    .from(rounds)
    .where(eq(rounds.id, roundId));
  if (!round) return null;

  const confirmedRows = await db
    .select({ userId: spots.userId })
    .from(spots)
    .where(and(eq(spots.roundId, roundId), eq(spots.status, "confirmed")));

  const ids = new Set<string>();
  ids.add(round.hostId);
  for (const row of confirmedRows) {
    ids.add(row.userId);
  }

  return {
    roundId: round.id,
    hostId: round.hostId,
    confirmedPlayerUserIds: [...ids],
  };
}

/** Every player user id exists (basic sanity when assembling a session). */
export async function allUsersExist(userIds: string[]): Promise<boolean> {
  if (userIds.length === 0) return true;
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.id, userIds));
  return rows.length === userIds.length;
}

/**
 * When linking to a round, every session player must be host or confirmed on that round.
 */
export function playerIdsAllowedForRound(
  ctx: RoundAccessContext,
  playerUserIds: string[],
): boolean {
  const allowed = new Set(ctx.confirmedPlayerUserIds);
  return playerUserIds.every((id) => allowed.has(id));
}
