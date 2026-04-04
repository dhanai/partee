export type ReadReceiptUpdate = {
  conversationId: string;
  readerUserId: string;
  readerAvatar: string | null;
  lastReadMessageId: string;
  lastReadMessageCreatedAt?: string | null;
};

type Listener = (update: ReadReceiptUpdate) => void;
const listeners = new Set<Listener>();

export function emitReadReceiptUpdate(update: ReadReceiptUpdate) {
  listeners.forEach((l) => {
    try {
      l(update);
    } catch {
      /* ignore */
    }
  });
}

export function subscribeReadReceiptUpdates(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
