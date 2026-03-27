import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversationParticipants } from "@/db/schema";
import { publishParfadeMessage } from "@/lib/parfade-ably-publish";
import { parfadeUserInboxChannel } from "@/lib/parfade-ably-channels";

export function parfadeConversationChannel(conversationId: string): string {
  return `parfade:v1:conversation:${conversationId}`;
}

export async function publishConversationMessage(input: {
  conversationId: string;
  messageId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  body: string;
}): Promise<void> {
  const bodyPreview = input.body.length > 100 ? input.body.slice(0, 97) + "…" : input.body;

  await publishParfadeMessage(parfadeConversationChannel(input.conversationId), {
    v: 1,
    type: "conversation-message",
    conversationId: input.conversationId,
    messageId: input.messageId,
    senderId: input.senderId,
    senderName: input.senderName,
    bodyPreview,
  });

  const participants = await db
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.conversationId, input.conversationId));

  await Promise.all(
    participants
      .filter((p) => p.userId !== input.senderId)
      .map((p) =>
        publishParfadeMessage(parfadeUserInboxChannel(p.userId), {
          v: 1,
          type: "conversation-toast",
          conversationId: input.conversationId,
          senderName: input.senderName,
          senderAvatar: input.senderAvatar ?? undefined,
          bodyPreview,
        }).catch(() => {}),
      ),
  );
}

export async function publishConversationReaction(input: {
  conversationId: string;
  messageId: string;
  userId: string;
  emoji: string;
  action: "add" | "remove";
}): Promise<void> {
  await publishParfadeMessage(parfadeConversationChannel(input.conversationId), {
    v: 1,
    type: "conversation-reaction",
    conversationId: input.conversationId,
    messageId: input.messageId,
    userId: input.userId,
    emoji: input.emoji,
    action: input.action,
  });
}
