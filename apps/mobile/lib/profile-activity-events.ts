type ProfileActivityEvent = {
  userId?: string | null;
};

const listeners = new Set<(event: ProfileActivityEvent) => void>();

export function emitProfileActivityEvent(event: ProfileActivityEvent) {
  listeners.forEach((listener) => listener(event));
}

export function subscribeProfileActivityEvents(
  listener: (event: ProfileActivityEvent) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
