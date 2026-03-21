type Listener = () => void;
const listeners = new Set<Listener>();

/** When Ably signals new notification-relevant activity, refetch the notifications screen if mounted. */
export function emitNotificationsListsShouldRefresh() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      // ignore
    }
  });
}

export function subscribeNotificationsListsRefresh(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
