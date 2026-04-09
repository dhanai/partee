import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { inAppNotifications, rounds, spots } from "@/db/schema";
import {
  publishAfterRoundDetailChanged,
  publishNotificationBadgeNudge,
} from "@/lib/parfade-ably-publish";
import {
  getOrCreateRoundConversation,
  removeRoundChatParticipant,
} from "@/lib/round-conversation";

export async function removeGuestFromRoundAsHost(input: {
  inviteToken: string;
  hostUserId: string;
  targetUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string; statusCode: number }> {
  const inviteToken = input.inviteToken.trim();
  if (!inviteToken) {
    return { ok: false, error: "Round not found.", statusCode: 404 };
  }

  const [round] = await db
    .select({ id: rounds.id, hostId: rounds.hostId })
    .from(rounds)
    .where(eq(rounds.inviteToken, inviteToken));

  if (!round) {
    return { ok: false, error: "Round not found.", statusCode: 404 };
  }

  if (round.hostId !== input.hostUserId) {
    return { ok: false, error: "Only the host can remove players.", statusCode: 403 };
  }

  if (input.targetUserId === round.hostId) {
    return { ok: false, error: "Cannot remove the host.", statusCode: 400 };
  }

  const [spot] = await db
    .select({ id: spots.id, status: spots.status })
    .from(spots)
    .where(and(eq(spots.roundId, round.id), eq(spots.userId, input.targetUserId)));

  if (!spot) {
    return { ok: false, error: "Player not on this round.", statusCode: 404 };
  }

  if (spot.status !== "invited" && spot.status !== "confirmed") {
    return {
      ok: false,
      error: "Player cannot be removed in their current state.",
      statusCode: 409,
    };
  }

  if (spot.status === "confirmed") {
    try {
      const convId = await getOrCreateRoundConversation(round.id);
      await removeRoundChatParticipant(convId, input.targetUserId);
    } catch (e) {
      console.error("[removeGuestFromRoundAsHost] chat sync", e);
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(inAppNotifications)
      .where(
        and(
          eq(inAppNotifications.recipientUserId, input.targetUserId),
          eq(inAppNotifications.type, "round_invite"),
          sql`${inAppNotifications.data}->>'inviteToken' = ${inviteToken}`,
        ),
      );

    await tx
      .delete(spots)
      .where(and(eq(spots.roundId, round.id), eq(spots.userId, input.targetUserId)));
  });

  await publishNotificationBadgeNudge(input.targetUserId, "round-invite").catch(() => {});
  await publishAfterRoundDetailChanged(inviteToken, "spots");

  return { ok: true };
}
