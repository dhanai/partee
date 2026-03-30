import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { spots } from "@/db/schema";
import { publishAfterRoundDetailChanged } from "@/lib/parfade-ably-publish";

/**
 * Removes the viewer's pending join request (spot status `requested`).
 * No-op if they are not in `requested` state for this round.
 */
export async function cancelJoinRequestForRound(params: {
  roundId: string;
  userId: string;
  inviteToken: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const removed = await db
    .delete(spots)
    .where(
      and(
        eq(spots.roundId, params.roundId),
        eq(spots.userId, params.userId),
        eq(spots.status, "requested"),
      ),
    )
    .returning({ id: spots.id });

  if (removed.length === 0) {
    return { ok: false, error: "No pending join request." };
  }

  await publishAfterRoundDetailChanged(params.inviteToken, "join");
  return { ok: true };
}
