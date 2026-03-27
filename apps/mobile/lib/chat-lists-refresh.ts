type Listener = () => void;
const listeners = new Set<Listener>();

export function emitChatListsShouldRefresh() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      // ignore subscriber errors
    }
  });
}

export function subscribeChatListsRefresh(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
