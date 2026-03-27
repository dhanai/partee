import type { Message as AblyChatMessage } from "@ably/chat";
import type { MessageAttachment } from "./attachment-types";
import type { CachedMessage } from "./message-cache";

type MessageMetadataPayload = {
  dbId?: string;
  body?: string | null;
  attachments?: MessageAttachment[] | null;
  parentId?: string | null;
  parentPreview?: { body: string; senderName: string } | null;
  user?: { id: string; name: string; avatar: string | null };
  reactions?: Record<string, { count: number; userIds: string[] }>;
  createdAt?: string;
};

export function ablyChatMessageToCached(
  msg: AblyChatMessage,
  viewerId: string | null,
): CachedMessage {
  const meta = (msg.metadata ?? {}) as MessageMetadataPayload;
  const userId = meta.user?.id ?? msg.clientId;

  return {
    id: meta.dbId ?? msg.serial,
    body: meta.body !== undefined ? meta.body : msg.text || null,
    attachments: meta.attachments ?? null,
    createdAt: meta.createdAt ?? msg.timestamp.toISOString(),
    isMine: viewerId != null && userId === viewerId,
    parentId: meta.parentId ?? null,
    parentPreview: meta.parentPreview ?? null,
    user: meta.user ?? { id: msg.clientId, name: msg.clientId, avatar: null },
    reactions: meta.reactions ?? {},
  };
}
