import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { conversationParticipants, conversations, userBlocks } from "@/db/schema";

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

/**
 * Returns true if either user has blocked the other.
 */
export async function hasBlockBetween(
  userA: string,
  userB: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: userBlocks.id })
    .from(userBlocks)
    .where(
      or(
        and(eq(userBlocks.blockerId, userA), eq(userBlocks.blockedId, userB)),
        and(eq(userBlocks.blockerId, userB), eq(userBlocks.blockedId, userA)),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * For a DM conversation, check if either participant has blocked the other.
 * Returns false for non-DM conversations (group/round chats).
 */
export async function isDmBlocked(
  conversationId: string,
  viewerId: string,
): Promise<boolean> {
  const [conv] = await db
    .select({ type: conversations.type })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conv || conv.type !== "dm") return false;

  const participants = await db
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.conversationId, conversationId));

  const otherUserId = participants.find((p) => p.userId !== viewerId)?.userId;
  if (!otherUserId) return false;

  return hasBlockBetween(viewerId, otherUserId);
}
