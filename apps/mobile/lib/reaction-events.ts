type ReactionUpdate = {
  conversationId: string;
  messageId: string;
  emoji: string;
  userId: string;
  action: "add" | "remove";
};

type Listener = (update: ReactionUpdate) => void;
const listeners = new Set<Listener>();

export function emitReactionUpdate(update: ReactionUpdate) {
  listeners.forEach((l) => {
    try {
      l(update);
    } catch {
      // ignore subscriber errors
    }
  });
}

export function subscribeReactionUpdates(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
