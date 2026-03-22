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
  const [row] = await db
    .select({ id: gameSessions.id })
    .from(gameSessions)
    .where(eq(gameSessions.id, sessionId));
  if (!row) {
    return { error: "Not found", status: 404 };
  }
  const allowed = await userIsGameParticipant(sessionId, userId);
  if (!allowed) {
    return { error: "Forbidden", status: 403 };
  }
  await db.delete(gameSessions).where(eq(gameSessions.id, sessionId));
  return { ok: true };
}
