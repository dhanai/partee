type GroupEventPost = {
  id: string;
  body: string;
  imageUrl: string | null;
  isPinned: boolean;
  createdAt: string;
  user: { id: string; name: string; avatar: string | null };
};

type GroupActivityEvent = {
  groupId: string;
  action: "created" | "updated";
  postId?: string;
  post?: GroupEventPost;
};

const listeners = new Set<(event: GroupActivityEvent) => void>();

export function emitGroupActivityEvent(event: GroupActivityEvent) {
  listeners.forEach((listener) => listener(event));
}

export function subscribeGroupActivityEvents(
  listener: (event: GroupActivityEvent) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
