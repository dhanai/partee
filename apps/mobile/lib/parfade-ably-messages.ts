/** Mirrors `lib/parfade-ably-messages.ts` on the server. */
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
      type: "conversation-message";
      conversationId: string;
      messageId: string;
      senderId: string;
      senderName: string;
      bodyPreview: string;
    }
  | {
      v: 1;
      type: "conversation-reaction";
      conversationId: string;
      messageId: string;
      userId: string;
      emoji: string;
      action: "add" | "remove";
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
  if (o.type === "conversation-message") {
    const r = raw as {
      conversationId?: unknown;
      messageId?: unknown;
      senderId?: unknown;
      senderName?: unknown;
      bodyPreview?: unknown;
    };
    if (
      typeof r.conversationId === "string" &&
      typeof r.messageId === "string" &&
      typeof r.senderId === "string" &&
      typeof r.senderName === "string" &&
      typeof r.bodyPreview === "string"
    ) {
      return {
        v: 1,
        type: "conversation-message",
        conversationId: r.conversationId,
        messageId: r.messageId,
        senderId: r.senderId,
        senderName: r.senderName,
        bodyPreview: r.bodyPreview,
      };
    }
  }
  if (o.type === "conversation-reaction") {
    const r = raw as {
      conversationId?: unknown;
      messageId?: unknown;
      userId?: unknown;
      emoji?: unknown;
      action?: unknown;
    };
    if (
      typeof r.conversationId === "string" &&
      typeof r.messageId === "string" &&
      typeof r.userId === "string" &&
      typeof r.emoji === "string" &&
      (r.action === "add" || r.action === "remove")
    ) {
      return {
        v: 1,
        type: "conversation-reaction",
        conversationId: r.conversationId,
        messageId: r.messageId,
        userId: r.userId,
        emoji: r.emoji,
        action: r.action,
      };
    }
  }
  return null;
}
