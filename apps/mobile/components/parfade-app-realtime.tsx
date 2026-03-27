import type { Message } from "ably";
import { useAbly } from "ably/react";
import { useCallback, useEffect, useState } from "react";
import { useAblyChatMounted } from "../lib/ably-chat-context";
import { parfadeDiscoverChannel, parfadeUserInboxChannel } from "../lib/parfade-ably-channels";
import { parseParfadeRealtimeMessage } from "../lib/parfade-ably-messages";
import { useChatUnread } from "../lib/chat-unread-context";
import { useInAppToast } from "../lib/in-app-toast-context";
import { emitChatListsShouldRefresh } from "../lib/chat-lists-refresh";
import { emitNotificationsListsShouldRefresh } from "../lib/notifications-list-refresh";
import { emitReactionUpdate } from "../lib/reaction-events";
import { emitRoundListsShouldRefresh } from "../lib/round-lists-refresh";
import { useNotificationBadge } from "../lib/notification-badge-context";

const PARFADE_EVENT = "parfade";

/**
 * Subscribes to Parfade-wide Ably channels (discover + per-user inbox).
 * Uses the Realtime client directly so we do not need a ChannelProvider per channel.
 * Must render under AblyProvider, InAppToastProvider, and NotificationBadgeProvider.
 */
export function ParfadeAppRealtime() {
  const ably = useAbly();
  const { refresh: refreshNotificationBadge } = useNotificationBadge();
  const { showRsvpToast, showConversationToast, showRoundInviteToast } = useInAppToast();
  const { markConversationUnread } = useChatUnread();
  const [inboxUserId, setInboxUserId] = useState<string | null>(null);

  useEffect(() => {
    const syncInboxId = () => {
      const id = ably.auth.clientId;
      setInboxUserId(typeof id === "string" && id.length > 0 ? id : null);
    };
    ably.connection.on("connected", syncInboxId);
    if (ably.connection.state === "connected") syncInboxId();
    return () => {
      ably.connection.off("connected", syncInboxId);
    };
  }, [ably]);

  const onInboxMessage = useCallback(
    (message: Message) => {
      const parsed = parseParfadeRealtimeMessage(message.data);
      if (!parsed) return;
      if (parsed.type === "inbox-sync") {
        if (parsed.roundLists) {
          emitRoundListsShouldRefresh();
        }
        if (parsed.notificationBadge) {
          void refreshNotificationBadge();
          emitNotificationsListsShouldRefresh();
        }
        return;
      }
      if (parsed.type === "rsvp-toast") {
        showRsvpToast({
          inviteToken: parsed.inviteToken,
          roundTitle: parsed.roundTitle,
          guestName: parsed.guestName,
          guestAvatar: parsed.guestAvatar,
          spotStatus: parsed.spotStatus,
        });
      }
      if (parsed.type === "conversation-toast") {
        markConversationUnread(parsed.conversationId);
        emitChatListsShouldRefresh();
        showConversationToast({
          conversationId: parsed.conversationId,
          senderName: parsed.senderName,
          senderAvatar: parsed.senderAvatar,
          bodyPreview: parsed.bodyPreview,
        });
      }
      if (parsed.type === "conversation-reaction") {
        emitReactionUpdate({
          conversationId: parsed.conversationId,
          messageId: parsed.messageId,
          emoji: parsed.emoji,
          userId: parsed.userId,
          action: parsed.action,
        });
        emitChatListsShouldRefresh();
      }
      if (parsed.type === "round-invite-toast") {
        emitRoundListsShouldRefresh();
        showRoundInviteToast({
          inviteToken: parsed.inviteToken,
          roundTitle: parsed.roundTitle,
          inviterName: parsed.inviterName,
          inviterAvatar: parsed.inviterAvatar,
        });
      }
    },
    [refreshNotificationBadge, showRsvpToast, showConversationToast, showRoundInviteToast, markConversationUnread],
  );

  const onDiscoverMessage = useCallback((message: Message) => {
    const parsed = parseParfadeRealtimeMessage(message.data);
    if (!parsed || parsed.type !== "discover-refresh") return;
    emitRoundListsShouldRefresh();
  }, []);

  useEffect(() => {
    const channel = ably.channels.get(parfadeDiscoverChannel());
    void channel.subscribe(PARFADE_EVENT, onDiscoverMessage);
    return () => {
      void channel.unsubscribe(PARFADE_EVENT, onDiscoverMessage);
    };
  }, [ably, onDiscoverMessage]);

  useEffect(() => {
    if (!inboxUserId) return;
    const channel = ably.channels.get(parfadeUserInboxChannel(inboxUserId));
    void channel.subscribe(PARFADE_EVENT, onInboxMessage);
    return () => {
      void channel.unsubscribe(PARFADE_EVENT, onInboxMessage);
    };
  }, [ably, inboxUserId, onInboxMessage]);

  return null;
}

/** Only mounts subscribers when Ably Realtime is active (inside AblyProvider). */
export function ParfadeAppRealtimeGate() {
  const mounted = useAblyChatMounted();
  if (!mounted) return null;
  return <ParfadeAppRealtime />;
}
