import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { rounds, spots, users } from "@/db/schema";
import {
  ensureRoundChatParticipant,
  getOrCreateRoundConversation,
  removeRoundChatParticipant,
} from "@/lib/round-conversation";
import { publishAfterRoundDetailChanged } from "@/lib/parfade-ably-publish";

async function syncSpotChatParticipant(
  roundId: string,
  userId: string,
  next: "confirmed" | "declined",
) {
  try {
    const convId = await getOrCreateRoundConversation(roundId);
    if (next === "confirmed") {
      await ensureRoundChatParticipant(convId, userId);
    } else {
      await removeRoundChatParticipant(convId, userId);
    }
  } catch (e) {
    console.error("[round spot chat sync]", e);
  }
}

/**
 * When join policy switches to instant, confirm pending `requested` spots in FIFO order
 * until the round is full (same capacity rules as manual host approve).
 */
export async function autoConfirmPendingJoinRequestsFifo(input: {
  roundId: string;
  inviteToken: string;
  totalSpots: number;
}): Promise<{ confirmedUserIds: string[] }> {
  const confirmedUserIds: string[] = [];

  const [confirmedCountResult] = await db
    .select({
      confirmedCount:
        sql<number>`coalesce(sum(case when ${spots.status} = 'confirmed' then 1 else 0 end), 0)`.mapWith(
          Number,
        ),
    })
    .from(spots)
    .where(eq(spots.roundId, input.roundId));

  let slotsRemaining =
    input.totalSpots - (confirmedCountResult?.confirmedCount ?? 0);
  if (slotsRemaining <= 0) {
    return { confirmedUserIds };
  }

  const pendingRows = await db
    .select()
    .from(spots)
    .where(and(eq(spots.roundId, input.roundId), eq(spots.status, "requested")))
    .orderBy(asc(spots.createdAt));

  for (const spot of pendingRows) {
    if (slotsRemaining <= 0) break;

    const updated = await db
      .update(spots)
      .set({ status: "confirmed", version: spot.version + 1 })
      .where(and(eq(spots.id, spot.id), eq(spots.version, spot.version)))
      .returning({ userId: spots.userId });

    if (updated.length === 0) {
      continue;
    }

    slotsRemaining -= 1;
    confirmedUserIds.push(updated[0]!.userId);
    void syncSpotChatParticipant(input.roundId, updated[0]!.userId, "confirmed");
  }

  if (confirmedUserIds.length > 0) {
    await publishAfterRoundDetailChanged(input.inviteToken, "join");
  }

  return { confirmedUserIds };
}

/**
 * Host approves or declines a guest's pending join request (spot status `requested`).
 */
export async function hostResolveGuestJoinRequest(input: {
  inviteToken: string;
  hostUserId: string;
  guestUserId: string;
  action: "accept" | "decline";
}): Promise<
  | { ok: true; newStatus: "confirmed" | "declined" }
  | { ok: false; error: string; statusCode: number }
> {
  const [round] = await db
    .select({
      id: rounds.id,
      inviteToken: rounds.inviteToken,
      hostId: rounds.hostId,
      totalSpots: rounds.totalSpots,
    })
    .from(rounds)
    .where(eq(rounds.inviteToken, input.inviteToken))
    .limit(1);

  if (!round) {
    return { ok: false, error: "Round not found.", statusCode: 404 };
  }
  if (round.hostId !== input.hostUserId) {
    return { ok: false, error: "Only the host can respond to join requests.", statusCode: 403 };
  }

  const [spot] = await db
    .select()
    .from(spots)
    .where(
      and(
        eq(spots.roundId, round.id),
        eq(spots.userId, input.guestUserId),
        eq(spots.status, "requested"),
      ),
    )
    .limit(1);

  if (!spot) {
    return { ok: false, error: "No pending join request for this player.", statusCode: 404 };
  }

  if (input.action === "decline") {
    const updated = await db
      .update(spots)
      .set({ status: "declined", version: spot.version + 1 })
      .where(and(eq(spots.id, spot.id), eq(spots.version, spot.version)))
      .returning({ id: spots.id });

    if (updated.length === 0) {
      return { ok: false, error: "Could not update spot. Try again.", statusCode: 409 };
    }
    void syncSpotChatParticipant(round.id, input.guestUserId, "declined");
    await publishAfterRoundDetailChanged(input.inviteToken, "join");
    return { ok: true, newStatus: "declined" };
  }

  const [confirmedCountResult] = await db
    .select({
      confirmedCount:
        sql<number>`coalesce(sum(case when ${spots.status} = 'confirmed' then 1 else 0 end), 0)`.mapWith(
          Number,
        ),
    })
    .from(spots)
    .where(eq(spots.roundId, round.id));

  const confirmedCount = confirmedCountResult?.confirmedCount ?? 0;
  if (confirmedCount >= round.totalSpots) {
    return { ok: false, error: "Round is full.", statusCode: 409 };
  }

  const updated = await db
    .update(spots)
    .set({ status: "confirmed", version: spot.version + 1 })
    .where(and(eq(spots.id, spot.id), eq(spots.version, spot.version)))
    .returning({ id: spots.id });

  if (updated.length === 0) {
    return { ok: false, error: "Could not confirm spot. Try again.", statusCode: 409 };
  }

  void syncSpotChatParticipant(round.id, input.guestUserId, "confirmed");
  await publishAfterRoundDetailChanged(input.inviteToken, "join");
  return { ok: true, newStatus: "confirmed" };
}

export async function listPendingJoinRequestsForRound(roundId: string) {
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      avatar: users.avatar,
    })
    .from(spots)
    .innerJoin(users, eq(users.id, spots.userId))
    .where(and(eq(spots.roundId, roundId), eq(spots.status, "requested")))
    .orderBy(asc(spots.createdAt));

  return rows.map((r) => ({
    userId: r.userId,
    name: r.name,
    avatar: r.avatar,
  }));
}
