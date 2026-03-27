import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { messages, messageReactions } from "@/db/schema";
import { VALID_EMOJIS, reactionPostSchema } from "@/lib/conversation-message-helpers";

/**
 * Add a reaction. Replaces any existing reaction from the same user on that message.
 */
export async function addReaction(input: {
  conversationId: string;
  messageId: string;
  userId: string;
  rawBody: unknown;
}): Promise<{ ok: true } | { error: string; status: number }> {
  const [msg] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.id, input.messageId), eq(messages.conversationId, input.conversationId)))
    .limit(1);

  if (!msg) return { error: "Message not found.", status: 404 };

  let emoji: string;
  try {
    ({ emoji } = reactionPostSchema.parse(input.rawBody));
  } catch (e) {
    if (e instanceof z.ZodError) return { error: "Invalid emoji.", status: 400 };
    throw e;
  }

  await db
    .delete(messageReactions)
    .where(
      and(
        eq(messageReactions.messageId, input.messageId),
        eq(messageReactions.userId, input.userId),
      ),
    );

  await db
    .insert(messageReactions)
    .values({ messageId: input.messageId, userId: input.userId, emoji: emoji as typeof VALID_EMOJIS[number] })
    .onConflictDoNothing();

  return { ok: true };
}

/**
 * Remove a reaction by emoji.
 */
export async function removeReaction(input: {
  conversationId: string;
  messageId: string;
  userId: string;
  emoji: string | null;
}): Promise<{ ok: true } | { error: string; status: number }> {
  if (!input.emoji || !(VALID_EMOJIS as readonly string[]).includes(input.emoji)) {
    return { error: "Invalid emoji.", status: 400 };
  }

  await db
    .delete(messageReactions)
    .where(
      and(
        eq(messageReactions.messageId, input.messageId),
        eq(messageReactions.userId, input.userId),
        eq(messageReactions.emoji, input.emoji as typeof VALID_EMOJIS[number]),
      ),
    );

  return { ok: true };
}
