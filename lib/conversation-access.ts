import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversationParticipants } from "@/db/schema";

/**
 * Check whether a user is a participant in a conversation.
 */
export async function isConversationParticipant(
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: conversationParticipants.id })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
      ),
    )
    .limit(1);
  return Boolean(row);
}
