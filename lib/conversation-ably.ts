import Ably from "ably";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversationParticipants } from "@/db/schema";
import { batchPublishParfadeMessages } from "@/lib/parfade-ably-publish";
import { parfadeUserInboxChannel } from "@/lib/parfade-ably-channels";
import type { MappedMessage } from "@/lib/conversation-message-helpers";
import { getImageUrls } from "@/lib/attachment-types";

let chatRest: Ably.Rest | null = null;
function getChatRest(): Ably.Rest | null {
  const key = process.env.ABLY_API_KEY?.trim();
  if (!key) return null;
  if (!chatRest) chatRest = new Ably.Rest({ key, clientId: "server" });
  return chatRest;
}

function chatTextPreview(message: MappedMessage): string {
  if (message.body) {
    return message.body.length > 100 ? message.body.slice(0, 97) + "…" : message.body;
  }
  const imgCount = getImageUrls(message.attachments ?? null).length;
  if (imgCount === 1) return "📷 Photo";
  if (imgCount > 1) return `📷 ${imgCount} photos`;
  return " ";
}

/**
 * Publish a message to an Ably Chat room via the Chat REST API.
 * clientId "server" satisfies the API requirement; the real sender
 * identity is carried in metadata.user and read by the mobile mapper.
 */
export async function publishChatRoomMessage(
  conversationId: string,
  message: MappedMessage,
): Promise<void> {
  const client = getChatRest();
  if (!client) return;

  const metadata: Record<string, unknown> = {
    dbId: message.id,
    body: message.body,
    user: message.user,
    reactions: message.reactions,
    createdAt: message.createdAt,
  };
  if (message.attachments) metadata.attachments = message.attachments;
  if (message.parentId) metadata.parentId = message.parentId;
  if (message.parentPreview) metadata.parentPreview = message.parentPreview;

  const res = await client.request("POST", `/chat/v4/rooms/${conversationId}/messages`, 4, {}, {
    text: chatTextPreview(message),
    metadata,
    headers: {},
  });

  if (!res.success) {
    console.error("[publishChatRoomMessage] Chat API failed:", res.statusCode, res.errorCode, res.errorMessage);
    throw new Error(`Chat API ${res.statusCode}: ${res.errorMessage}`);
  }
}

/**
 * Broadcast a reaction update to every participant in the conversation via their inbox channel.
 */
export async function publishReactionUpdate(input: {
  conversationId: string;
  messageId: string;
  emoji: string;
  userId: string;
  action: "add" | "remove";
}): Promise<void> {
  const participants = await db
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.conversationId, input.conversationId));

  const others = participants.filter((p) => p.userId !== input.userId);
  await batchPublishParfadeMessages(
    others.map((p) => ({
      channel: parfadeUserInboxChannel(p.userId),
      payload: {
        v: 1 as const,
        type: "conversation-reaction" as const,
        conversationId: input.conversationId,
        messageId: input.messageId,
        emoji: input.emoji,
        userId: input.userId,
        action: input.action,
      },
    })),
  );
}

/**
 * Send inbox toast to each non-sender participant (for in-app toast + unread dot).
 */
export async function publishConversationInboxToasts(input: {
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  body: string;
}): Promise<void> {
  const bodyPreview = input.body.length > 100 ? input.body.slice(0, 97) + "…" : input.body;

  const participants = await db
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.conversationId, input.conversationId));

  const others = participants.filter((p) => p.userId !== input.senderId);
  await batchPublishParfadeMessages(
    others.map((p) => ({
      channel: parfadeUserInboxChannel(p.userId),
      payload: {
        v: 1 as const,
        type: "conversation-toast" as const,
        conversationId: input.conversationId,
        senderName: input.senderName,
        senderAvatar: input.senderAvatar ?? undefined,
        bodyPreview,
      },
    })),
  );
}
