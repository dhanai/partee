import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { gameSessionUserListDismissals, gameSessions } from "@/db/schema";
import { userIsGameParticipant } from "@/lib/games/session-queries";

export type DismissSessionFromListResult =
  | { ok: true }
  | { error: string; status: 400 | 403 | 404 };

export async function dismissGameSessionFromMyList(
  sessionId: string,
  userId: string,
): Promise<DismissSessionFromListResult> {
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
  await db.insert(gameSessionUserListDismissals).values({ userId, sessionId }).onConflictDoNothing();
  return { ok: true };
}
