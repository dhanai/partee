/** Shape of `MappedMessage` as serialized on Parfade inbox (avoids importing message helpers into this module). */
export type ParfadeMappedMessageV1 = {
  id: string;
  body: string | null;
  attachments?: unknown;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  isMine: boolean;
  parentId?: string | null;
  parentPreview?: { body: string; senderName: string } | null;
  user: { id: string; name: string; avatar: string | null };
  reactions: Record<string, { count: number; userIds: string[] }>;
};

/** Payloads published on Parfade Ably channels (event name `parfade`). */
export type ParfadeRealtimeMessageV1 =
  | { v: 1; type: "discover-refresh"; reason?: string }
  | { v: 1; type: "inbox-sync"; roundLists?: boolean; notificationBadge?: boolean; reason?: string }
  | { v: 1; type: "profile-updated"; userId: string }
  | { v: 1; type: "round-detail-updated"; inviteToken: string; reason?: string }
  | {
      v: 1;
      type: "rsvp-toast";
      inviteToken: string;
      roundTitle: string;
      guestName: string;
      guestAvatar?: string;
      spotStatus: "confirmed" | "requested" | "declined";
    }
  | {
      v: 1;
      type: "conversation-toast";
      conversationId: string;
      senderName: string;
      senderAvatar?: string;
      bodyPreview: string;
    }
  | {
      v: 1;
      type: "round-invite-toast";
      inviteToken: string;
      roundTitle: string;
      inviterName: string;
      inviterAvatar?: string;
    }
  | {
      v: 1;
      type: "conversation-reaction";
      conversationId: string;
      messageId: string;
      emoji: string;
      userId: string;
      action: "add" | "remove";
    }
  | {
      v: 1;
      type: "post-comment-added";
      postId: string;
      comment: {
        id: string;
        body: string;
        createdAt: string;
        user: { id: string; name: string; avatar: string | null };
      };
    }
  | {
      v: 1;
      type: "post-like-updated";
      postId: string;
      userId: string;
      liked: boolean;
    }
  | {
      v: 1;
      type: "game-session-updated";
      sessionId: string;
      reason: string;
    }
  | {
      v: 1;
      type: "group-activity-updated";
      groupId: string;
      reason: string;
    }
  /** Full message row after edit or soft-delete; clients should recompute `isMine` from `message.user.id`. */
  | {
      v: 1;
      type: "conversation-message-mutation";
      conversationId: string;
      mutation: "edit" | "delete";
      message: ParfadeMappedMessageV1;
    }
  | {
      v: 1;
      type: "conversation-read-receipt-updated";
      conversationId: string;
      readerUserId: string;
      readerAvatar?: string;
      lastReadMessageId: string;
      lastReadMessageCreatedAt?: string;
    };
