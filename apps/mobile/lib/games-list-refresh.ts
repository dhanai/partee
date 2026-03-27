type Listener = () => void;
const listeners = new Set<Listener>();

export function emitGamesListShouldRefresh() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      // ignore subscriber errors
    }
  });
}

export function subscribeGamesListRefresh(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
