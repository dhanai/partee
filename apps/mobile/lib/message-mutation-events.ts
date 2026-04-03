import type { ParfadeMappedMessageV1 } from "./parfade-ably-messages";
import type { MessageAttachment } from "./attachment-types";
import type { CachedMessage } from "./message-cache";

export type ConversationMessageMutation = {
  conversationId: string;
  mutation: "edit" | "delete";
  message: ParfadeMappedMessageV1;
};

export function parfadeMutationMessageToCached(
  m: ParfadeMappedMessageV1,
  viewerId: string | null,
): CachedMessage {
  return {
    id: m.id,
    body: m.body,
    attachments: (m.attachments as MessageAttachment[] | null | undefined) ?? null,
    createdAt: m.createdAt,
    editedAt: m.editedAt ?? null,
    deletedAt: m.deletedAt ?? null,
    isMine: viewerId != null && m.user.id === viewerId,
    parentId: m.parentId ?? null,
    parentPreview: m.parentPreview ?? null,
    user: m.user,
    reactions: m.reactions ?? {},
  };
}

type Listener = (update: ConversationMessageMutation) => void;
const listeners = new Set<Listener>();

export function emitMessageMutation(update: ConversationMessageMutation) {
  listeners.forEach((l) => {
    try {
      l(update);
    } catch {
      /* ignore */
    }
  });
}

export function subscribeMessageMutations(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
