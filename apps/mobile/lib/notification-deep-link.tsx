import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect } from "react";

function openNotificationData(
  router: ReturnType<typeof useRouter>,
  data: Record<string, unknown>,
) {
  const type = data.type;
  const inviteToken = typeof data.inviteToken === "string" ? data.inviteToken.trim() : "";
  if (inviteToken.length > 0 && type === "round_chat") {
    router.push({
      pathname: "/round/[token]/chat",
      params: { token: inviteToken },
    });
    return;
  }
  if (
    inviteToken.length > 0 &&
    (type === "round_invite" || type === "round_rsvp")
  ) {
    router.push(`/round/${inviteToken}`);
    return;
  }
  if (type === "follow_request") {
    router.push("/notifications");
    return;
  }
  if (type === "conversation_message") {
    const conversationId =
      typeof data.conversationId === "string" ? data.conversationId.trim() : "";
    if (conversationId.length > 0) {
      router.push({
        pathname: "/conversation/[id]/chat",
        params: { id: conversationId },
      });
      return;
    }
  }
  if (type === "group_join_request") {
    router.push("/notifications");
    return;
  }
  if (type === "group_join_accepted") {
    const groupId = typeof data.groupId === "string" ? data.groupId.trim() : "";
    if (groupId.length > 0) {
      router.push({ pathname: "/group/[groupId]", params: { groupId } });
      return;
    }
  }
  if (type === "group_post" || type === "group_announcement") {
    const groupId = typeof data.groupId === "string" ? data.groupId.trim() : "";
    if (groupId.length > 0) {
      router.push({
        pathname: "/group/[groupId]",
        params: { groupId },
      });
      return;
    }
  }
}

/**
 * Handles notification taps: chat pushes open fullscreen group chat; invite/RSVP open round detail;
 * follow requests open Notifications.
 * Renders nothing; mount once inside the root layout (inside Expo Router).
 */
export function NotificationDeepLinkEffects() {
  const router = useRouter();

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      openNotificationData(
        router,
        (response.notification.request.content.data as Record<string, unknown>) ?? {},
      );
    });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      openNotificationData(
        router,
        (response.notification.request.content.data as Record<string, unknown>) ?? {},
      );
    });

    return () => sub.remove();
  }, [router]);

  return null;
}
