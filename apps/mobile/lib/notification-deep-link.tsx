import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect } from "react";

function openNotificationData(
  router: ReturnType<typeof useRouter>,
  data: Record<string, unknown>,
) {
  const type = data.type;
  const inviteToken = typeof data.inviteToken === "string" ? data.inviteToken.trim() : "";
  if (
    inviteToken.length > 0 &&
    (type === "round_invite" || type === "round_rsvp" || type === "round_chat")
  ) {
    router.push(`/round/${inviteToken}`);
    return;
  }
  if (type === "follow_request") {
    router.push("/notifications");
  }
}

/**
 * Handles notification taps: round-related pushes open the round screen; follow requests open Notifications.
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
