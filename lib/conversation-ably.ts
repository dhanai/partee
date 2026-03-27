import Ably from "ably";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversationParticipants } from "@/db/schema";
import { publishParfadeMessage } from "@/lib/parfade-ably-publish";
import { parfadeUserInboxChannel } from "@/lib/parfade-ably-channels";
import type { MappedMessage } from "@/lib/conversation-message-helpers";

let rest: Ably.Rest | null = null;
function getAblyRest(): Ably.Rest | null {
  const key = process.env.ABLY_API_KEY?.trim();
  if (!key) return null;
  if (!rest) rest = new Ably.Rest({ key });
  return rest;
}

/**
 * Publish a message to an Ably Chat room via the Chat REST API.
 * Subscribers using the Chat SDK's useMessages hook receive it instantly.
 */
export async function publishChatRoomMessage(
  conversationId: string,
  message: MappedMessage,
): Promise<void> {
  const client = getAblyRest();
  if (!client) return;

  const bodyPreview = message.body
    ? message.body.length > 100 ? message.body.slice(0, 97) + "…" : message.body
    : "";

  await client.request("POST", `/chat/v4/rooms/${conversationId}/messages`, 4, {}, {
    text: bodyPreview,
    metadata: {
      dbId: message.id,
      body: message.body,
      attachments: message.attachments ?? null,
      parentId: message.parentId ?? null,
      parentPreview: message.parentPreview ?? null,
      user: message.user,
      reactions: message.reactions,
      createdAt: message.createdAt,
    },
    headers: {},
  });
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
