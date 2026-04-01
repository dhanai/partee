type ProfileEventPost = {
  id: string;
  body: string;
  imageUrl: string | null;
  imageUrls?: string[];
  createdAt: string;
  isPinned?: boolean;
  profileUserId?: string | null;
  likeCount?: number;
  commentCount?: number;
  viewerLiked?: boolean;
  user: { id: string; name: string; avatar: string | null };
};

type ProfileActivityEvent = {
  profileUserId?: string | null;
  post?: ProfileEventPost;
  action?: "created" | "updated" | "deleted";
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
