import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversationParticipants, conversations } from "@/db/schema";

/**
 * Returns the conversation ID for a round, creating one if it doesn't exist.
 */
export async function getOrCreateRoundConversation(roundId: string): Promise<string> {
  const [existing] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.roundId, roundId), eq(conversations.type, "round")))
    .limit(1);

  if (existing) return existing.id;

  const [created] = await db
    .insert(conversations)
    .values({ type: "round", roundId })
    .returning({ id: conversations.id });

  return created.id;
}

/**
 * Returns the conversation ID for a round, or null if none exists.
 */
export async function getRoundConversationId(roundId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.roundId, roundId), eq(conversations.type, "round")))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Adds a user to a round's conversation participants (idempotent).
 */
export async function ensureRoundChatParticipant(
  conversationId: string,
  userId: string,
): Promise<void> {
  await db
    .insert(conversationParticipants)
    .values({ conversationId, userId })
    .onConflictDoNothing();
}

/**
 * Removes a user from a round's conversation participants.
 */
export async function removeRoundChatParticipant(
  conversationId: string,
  userId: string,
): Promise<void> {
  await db
    .delete(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
      ),
    );
}
