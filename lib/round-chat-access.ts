import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { conversationParticipants, conversations } from "@/db/schema";

/**
 * Conversation participants for round chat push (excluding sender).
 */
export async function listRoundChatPushRecipientUserIds(
  roundId: string,
  excludeUserId: string,
): Promise<string[]> {
  const [conv] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.roundId, roundId), eq(conversations.type, "round")))
    .limit(1);

  if (!conv) return [];

  const rows = await db
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conv.id),
        ne(conversationParticipants.userId, excludeUserId),
      ),
    );

  return rows.map((r) => r.userId);
}

/**
 * Whether a user is a participant in the round's conversation.
 */
export async function canAccessRoundChat(roundId: string, viewerUserId: string): Promise<boolean> {
  const [conv] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.roundId, roundId), eq(conversations.type, "round")))
    .limit(1);

  if (!conv) return false;

  const [participant] = await db
    .select({ id: conversationParticipants.id })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conv.id),
        eq(conversationParticipants.userId, viewerUserId),
      ),
    )
    .limit(1);

  return Boolean(participant);
}
