import { db } from "@/db";
import { conversationReadReceipts } from "@/db/schema";

/**
 * Upsert a read receipt for a user on a conversation.
 */
export async function markConversationRead(
  userId: string,
  conversationId: string,
): Promise<void> {
  const now = new Date();
  await db
    .insert(conversationReadReceipts)
    .values({ userId, conversationId, lastReadAt: now })
    .onConflictDoUpdate({
      target: [conversationReadReceipts.userId, conversationReadReceipts.conversationId],
      set: { lastReadAt: now },
    });
}
