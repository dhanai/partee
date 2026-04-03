import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { gameSessionPlayers, profileGameSessionSettings } from "@/db/schema";

export async function viewerIsGameSessionParticipant(
  sessionId: string,
  viewerId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: gameSessionPlayers.id })
    .from(gameSessionPlayers)
    .where(
      and(eq(gameSessionPlayers.sessionId, sessionId), eq(gameSessionPlayers.userId, viewerId)),
    )
    .limit(1);
  return Boolean(row);
}

export type PatchProfileGameSessionSettingsInput = {
  profileUserId: string;
  sessionId: string;
  viewerId: string;
  isPinned?: boolean;
  hideFromProfile?: boolean;
};

/**
 * Profile owner only; viewer must be a player on the session.
 */
export async function patchProfileGameSessionSettings(
  input: PatchProfileGameSessionSettingsInput,
): Promise<void> {
  const { profileUserId, sessionId, viewerId, isPinned, hideFromProfile } = input;
  if (viewerId !== profileUserId) {
    throw new Error("Forbidden");
  }
  const ok = await viewerIsGameSessionParticipant(sessionId, viewerId);
  if (!ok) {
    throw new Error("Forbidden");
  }
  if (isPinned === undefined && hideFromProfile === undefined) {
    return;
  }

  const [existing] = await db
    .select()
    .from(profileGameSessionSettings)
    .where(
      and(
        eq(profileGameSessionSettings.userId, profileUserId),
        eq(profileGameSessionSettings.sessionId, sessionId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(profileGameSessionSettings)
      .set({
        ...(isPinned !== undefined ? { isPinned } : {}),
        ...(hideFromProfile !== undefined ? { hiddenOnProfile: hideFromProfile } : {}),
        updatedAt: new Date(),
      })
      .where(eq(profileGameSessionSettings.id, existing.id));
    return;
  }

  await db.insert(profileGameSessionSettings).values({
    userId: profileUserId,
    sessionId,
    isPinned: isPinned ?? false,
    hiddenOnProfile: hideFromProfile ?? false,
  });
}
