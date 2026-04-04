import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversationReadReceipts, messages, users } from "@/db/schema";
import { publishReadReceiptUpdate } from "@/lib/conversation-ably";

/**
 * Upsert a read receipt for a user on a conversation.
 * When `lastMessageId` is set, it must belong to this conversation; updates `last_read_message_id` and notifies other participants.
 */
export async function markConversationRead(
  userId: string,
  conversationId: string,
  options?: { lastMessageId?: string | null },
): Promise<void> {
  const now = new Date();
  let lastReadMessageId: string | null = null;

  let lastReadMessageCreatedAt: string | null = null;
  if (options?.lastMessageId) {
    const [msg] = await db
      .select({ id: messages.id, createdAt: messages.createdAt })
      .from(messages)
      .where(and(eq(messages.id, options.lastMessageId), eq(messages.conversationId, conversationId)))
      .limit(1);
    if (!msg) {
      throw new Error("INVALID_LAST_MESSAGE");
    }
    lastReadMessageId = msg.id;
    lastReadMessageCreatedAt = msg.createdAt.toISOString();
  }

  const setCols =
    lastReadMessageId != null
      ? { lastReadAt: now, lastReadMessageId }
      : { lastReadAt: now };

  await db
    .insert(conversationReadReceipts)
    .values({
      userId,
      conversationId,
      lastReadAt: now,
      lastReadMessageId: lastReadMessageId ?? null,
    })
    .onConflictDoUpdate({
      target: [conversationReadReceipts.userId, conversationReadReceipts.conversationId],
      set: setCols,
    });

  if (lastReadMessageId) {
    const [reader] = await db
      .select({ avatar: users.avatar })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    await publishReadReceiptUpdate({
      conversationId,
      readerUserId: userId,
      readerAvatar: reader?.avatar ?? null,
      lastReadMessageId,
      lastReadMessageCreatedAt: lastReadMessageCreatedAt ?? undefined,
    }).catch((err) => console.error("[markConversationRead] receipt pub", err));
  }
}
