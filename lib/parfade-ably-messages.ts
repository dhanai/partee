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
    };
