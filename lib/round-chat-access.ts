import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { rounds, spots } from "@/db/schema";

/**
 * Host + confirmed players (for chat push), excluding `excludeUserId` (usually the sender).
 */
export async function listRoundChatPushRecipientUserIds(
  roundId: string,
  excludeUserId: string,
): Promise<string[]> {
  const [row] = await db
    .select({ hostId: rounds.hostId })
    .from(rounds)
    .where(eq(rounds.id, roundId))
    .limit(1);

  if (!row) return [];

  const confirmed = await db
    .select({ userId: spots.userId })
    .from(spots)
    .where(and(eq(spots.roundId, roundId), eq(spots.status, "confirmed")));

  const ids = new Set<string>();
  ids.add(row.hostId);
  for (const s of confirmed) ids.add(s.userId);
  ids.delete(excludeUserId);
  return Array.from(ids);
}

/** Host or confirmed spot on the round may use group chat. */
export async function canAccessRoundChat(roundId: string, viewerUserId: string): Promise<boolean> {
  const [row] = await db
    .select({ hostId: rounds.hostId })
    .from(rounds)
    .where(eq(rounds.id, roundId))
    .limit(1);

  if (!row) return false;
  if (row.hostId === viewerUserId) return true;

  const [spot] = await db
    .select({ id: spots.id })
    .from(spots)
    .where(
      and(
        eq(spots.roundId, roundId),
        eq(spots.userId, viewerUserId),
        eq(spots.status, "confirmed"),
      ),
    )
    .limit(1);

  return Boolean(spot);
}
