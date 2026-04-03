import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { gameSessions } from "@/db/schema";
import { userIsGameParticipant } from "@/lib/games/session-queries";

export type DeleteSessionResult =
  | { ok: true }
  | { error: string; status: 400 | 403 | 404 };

export async function deleteGameSessionIfAllowed(
  sessionId: string,
  userId: string,
): Promise<DeleteSessionResult> {
  if (!z.string().uuid().safeParse(sessionId).success) {
    return { error: "Invalid session id", status: 400 };
  }
  const [session] = await db
    .select({
      id: gameSessions.id,
      status: gameSessions.status,
      createdBy: gameSessions.createdBy,
    })
    .from(gameSessions)
    .where(eq(gameSessions.id, sessionId));
  if (!session) {
    return { error: "Not found", status: 404 };
  }
  const allowed = await userIsGameParticipant(sessionId, userId);
  if (!allowed) {
    return { error: "Forbidden", status: 403 };
  }
  if (session.status === "completed" || session.status === "abandoned") {
    return {
      error: "Finished games stay on record for the group. Remove them from your list instead.",
      status: 403,
    };
  }
  if (session.status === "active" && session.createdBy !== userId) {
    return {
      error: "Only the host can cancel an active game for everyone.",
      status: 403,
    };
  }
  await db.delete(gameSessions).where(eq(gameSessions.id, sessionId));
  return { ok: true };
}
