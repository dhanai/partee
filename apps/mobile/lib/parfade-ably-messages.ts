/** Mirrors `lib/parfade-ably-messages.ts` on the server. */
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

export function parseParfadeRealtimeMessage(data: unknown): ParfadeRealtimeMessageV1 | null {
  let raw: unknown = data;
  if (typeof data === "string") {
    try {
      raw = JSON.parse(data) as unknown;
    } catch {
      return null;
    }
  }
  if (raw === null || typeof raw !== "object") return null;
  const o = raw as { v?: unknown; type?: unknown; userId?: unknown };
  if (o.v !== 1 || typeof o.type !== "string") return null;
  if (o.type === "discover-refresh") {
    const r = (raw as { reason?: unknown }).reason;
    return {
      v: 1,
      type: "discover-refresh",
      reason: typeof r === "string" ? r : undefined,
    };
  }
  if (o.type === "inbox-sync") {
    const m = raw as {
      roundLists?: unknown;
      notificationBadge?: unknown;
      reason?: unknown;
    };
    return {
      v: 1,
      type: "inbox-sync",
      roundLists: m.roundLists === true,
      notificationBadge: m.notificationBadge === true,
      reason: typeof m.reason === "string" ? m.reason : undefined,
    };
  }
  if (o.type === "profile-updated" && typeof o.userId === "string") {
    return { v: 1, type: "profile-updated", userId: o.userId };
  }
  if (o.type === "round-detail-updated" && typeof (raw as { inviteToken?: unknown }).inviteToken === "string") {
    const inviteToken = (raw as { inviteToken: string }).inviteToken;
    const reasonRaw = (raw as { reason?: unknown }).reason;
    return {
      v: 1,
      type: "round-detail-updated",
      inviteToken,
      reason: typeof reasonRaw === "string" ? reasonRaw : undefined,
    };
  }
  if (o.type === "rsvp-toast") {
    const r = raw as {
      inviteToken?: unknown;
      roundTitle?: unknown;
      guestName?: unknown;
      guestAvatar?: unknown;
      spotStatus?: unknown;
    };
    if (
      typeof r.inviteToken === "string" &&
      typeof r.roundTitle === "string" &&
      typeof r.guestName === "string" &&
      (r.spotStatus === "confirmed" || r.spotStatus === "requested" || r.spotStatus === "declined")
    ) {
      return {
        v: 1,
        type: "rsvp-toast",
        inviteToken: r.inviteToken,
        roundTitle: r.roundTitle,
        guestName: r.guestName,
        guestAvatar: typeof r.guestAvatar === "string" ? r.guestAvatar : undefined,
        spotStatus: r.spotStatus,
      };
    }
  }
  if (o.type === "conversation-toast") {
    const r = raw as {
      conversationId?: unknown;
      senderName?: unknown;
      senderAvatar?: unknown;
      bodyPreview?: unknown;
    };
    if (
      typeof r.conversationId === "string" &&
      typeof r.senderName === "string" &&
      typeof r.bodyPreview === "string"
    ) {
      return {
        v: 1,
        type: "conversation-toast",
        conversationId: r.conversationId,
        senderName: r.senderName,
        senderAvatar: typeof r.senderAvatar === "string" ? r.senderAvatar : undefined,
        bodyPreview: r.bodyPreview,
      };
    }
  }
  if (o.type === "round-invite-toast") {
    const r = raw as {
      inviteToken?: unknown;
      roundTitle?: unknown;
      inviterName?: unknown;
      inviterAvatar?: unknown;
    };
    if (
      typeof r.inviteToken === "string" &&
      typeof r.roundTitle === "string" &&
      typeof r.inviterName === "string"
    ) {
      return {
        v: 1,
        type: "round-invite-toast",
        inviteToken: r.inviteToken,
        roundTitle: r.roundTitle,
        inviterName: r.inviterName,
        inviterAvatar: typeof r.inviterAvatar === "string" ? r.inviterAvatar : undefined,
      };
    }
  }
  if (o.type === "conversation-reaction") {
    const r = raw as {
      conversationId?: unknown;
      messageId?: unknown;
      emoji?: unknown;
      userId?: unknown;
      action?: unknown;
    };
    if (
      typeof r.conversationId === "string" &&
      typeof r.messageId === "string" &&
      typeof r.emoji === "string" &&
      typeof r.userId === "string" &&
      (r.action === "add" || r.action === "remove")
    ) {
      return {
        v: 1,
        type: "conversation-reaction",
        conversationId: r.conversationId,
        messageId: r.messageId,
        emoji: r.emoji,
        userId: r.userId,
        action: r.action,
      };
    }
  }
  if (o.type === "post-like-updated") {
    const r = raw as { postId?: unknown; userId?: unknown; liked?: unknown };
    if (typeof r.postId === "string" && typeof r.userId === "string" && typeof r.liked === "boolean") {
      return { v: 1, type: "post-like-updated", postId: r.postId, userId: r.userId, liked: r.liked };
    }
  }
  if (o.type === "post-comment-added") {
    const r = raw as { postId?: unknown; comment?: unknown };
    if (typeof r.postId === "string" && r.comment && typeof r.comment === "object") {
      const c = r.comment as { id?: unknown; body?: unknown; createdAt?: unknown; user?: unknown };
      if (typeof c.id === "string" && typeof c.body === "string" && typeof c.createdAt === "string" && c.user && typeof c.user === "object") {
        const u = c.user as { id?: unknown; name?: unknown; avatar?: unknown };
        if (typeof u.id === "string" && typeof u.name === "string") {
          return {
            v: 1,
            type: "post-comment-added",
            postId: r.postId,
            comment: {
              id: c.id,
              body: c.body,
              createdAt: c.createdAt,
              user: { id: u.id, name: u.name, avatar: typeof u.avatar === "string" ? u.avatar : null },
            },
          };
        }
      }
    }
  }
  if (o.type === "game-session-updated") {
    const r = raw as { sessionId?: unknown; reason?: unknown };
    if (typeof r.sessionId === "string") {
      return {
        v: 1,
        type: "game-session-updated",
        sessionId: r.sessionId,
        reason: typeof r.reason === "string" ? r.reason : "unknown",
      };
    }
  }
  if (o.type === "group-activity-updated") {
    const r = raw as { groupId?: unknown; reason?: unknown };
    if (typeof r.groupId === "string") {
      return {
        v: 1,
        type: "group-activity-updated",
        groupId: r.groupId,
        reason: typeof r.reason === "string" ? r.reason : "unknown",
      };
    }
  }
  if (o.type === "conversation-message-mutation") {
    const r = raw as {
      conversationId?: unknown;
      mutation?: unknown;
      message?: unknown;
    };
    const msg = parseParfadeMappedMessageV1(r.message);
    if (
      typeof r.conversationId === "string" &&
      (r.mutation === "edit" || r.mutation === "delete") &&
      msg
    ) {
      return {
        v: 1,
        type: "conversation-message-mutation",
        conversationId: r.conversationId,
        mutation: r.mutation,
        message: msg,
      };
    }
  }
  if (o.type === "conversation-read-receipt-updated") {
    const r = raw as {
      conversationId?: unknown;
      readerUserId?: unknown;
      readerAvatar?: unknown;
      lastReadMessageId?: unknown;
      lastReadMessageCreatedAt?: unknown;
    };
    if (
      typeof r.conversationId === "string" &&
      typeof r.readerUserId === "string" &&
      typeof r.lastReadMessageId === "string"
    ) {
      return {
        v: 1,
        type: "conversation-read-receipt-updated",
        conversationId: r.conversationId,
        readerUserId: r.readerUserId,
        readerAvatar: typeof r.readerAvatar === "string" ? r.readerAvatar : undefined,
        lastReadMessageId: r.lastReadMessageId,
        lastReadMessageCreatedAt:
          typeof r.lastReadMessageCreatedAt === "string" ? r.lastReadMessageCreatedAt : undefined,
      };
    }
  }
  return null;
}

function parseParfadeMappedMessageV1(raw: unknown): ParfadeMappedMessageV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== "string" || typeof m.createdAt !== "string") return null;
  const user = m.user;
  if (!user || typeof user !== "object") return null;
  const u = user as Record<string, unknown>;
  if (typeof u.id !== "string" || typeof u.name !== "string") return null;

  let reactions: Record<string, { count: number; userIds: string[] }> = {};
  if (m.reactions && typeof m.reactions === "object" && m.reactions !== null) {
    reactions = m.reactions as Record<string, { count: number; userIds: string[] }>;
  }

  let parentPreview: { body: string; senderName: string } | undefined;
  if (m.parentPreview && typeof m.parentPreview === "object") {
    const p = m.parentPreview as Record<string, unknown>;
    if (typeof p.body === "string" && typeof p.senderName === "string") {
      parentPreview = { body: p.body, senderName: p.senderName };
    }
  }

  return {
    id: m.id,
    body: m.body === null || typeof m.body === "string" ? m.body : null,
    attachments: m.attachments,
    createdAt: m.createdAt,
    editedAt: typeof m.editedAt === "string" ? m.editedAt : m.editedAt === null ? null : undefined,
    deletedAt: typeof m.deletedAt === "string" ? m.deletedAt : m.deletedAt === null ? null : undefined,
    isMine: m.isMine === true,
    parentId: typeof m.parentId === "string" ? m.parentId : m.parentId === null ? null : undefined,
    parentPreview,
    user: { id: u.id, name: u.name, avatar: typeof u.avatar === "string" ? u.avatar : null },
    reactions,
  };
}
