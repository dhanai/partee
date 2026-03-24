/** Payloads published on Parfade Ably channels (event name `parfade`). */
export type ParfadeRealtimeMessageV1 =
  | { v: 1; type: "discover-refresh"; reason?: string }
  | { v: 1; type: "inbox-sync"; roundLists?: boolean; notificationBadge?: boolean; reason?: string }
  | { v: 1; type: "profile-updated"; userId: string }
  | { v: 1; type: "round-detail-updated"; inviteToken: string; reason?: string }
  | {
      v: 1;
      type: "group-chat-toast";
      inviteToken: string;
      roundTitle: string;
      senderLabel: string;
      bodyPreview: string;
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
