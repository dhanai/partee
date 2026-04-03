import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { useEffect, useRef } from "react";

/** Expo / FCM often deliver payload values as strings; some stacks use snake_case keys. */
function payloadString(data: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = data[key];
    if (v == null) continue;
    if (typeof v === "string") {
      const t = v.trim();
      if (t.length > 0) return t;
    }
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

function openNotificationData(
  router: ReturnType<typeof useRouter>,
  data: Record<string, unknown>,
) {
  const type = payloadString(data, "type", "Type");
  const typeNorm = type.toLowerCase();
  const inviteToken = payloadString(data, "inviteToken", "invite_token");
  if (inviteToken.length > 0 && typeNorm === "round_chat") {
    router.push({
      pathname: "/round/[token]/chat",
      params: { token: inviteToken },
    });
    return;
  }
  if (
    inviteToken.length > 0 &&
    (typeNorm === "round_invite" || typeNorm === "round_rsvp")
  ) {
    const hostJoinRequests =
      typeNorm === "round_rsvp" &&
      (data.spotStatus === "requested" ||
        data.hostJoinRequests === "1" ||
        data.hostJoinRequests === 1);
    router.push({
      pathname: "/round/[token]",
      params: {
        token: inviteToken,
        ...(hostJoinRequests ? { hostJoinRequests: "1" } : {}),
      },
    });
    return;
  }
  if (typeNorm === "follow_request") {
    router.push("/notifications");
    return;
  }
  if (typeNorm === "conversation_message") {
    const conversationId = payloadString(data, "conversationId", "conversation_id");
    if (conversationId.length > 0) {
      router.push({
        pathname: "/conversation/[id]/chat",
        params: { id: conversationId },
      });
      return;
    }
    if (inviteToken.length > 0) {
      router.push({
        pathname: "/round/[token]/chat",
        params: { token: inviteToken },
      });
      return;
    }
  }
  if (typeNorm === "group_join_request") {
    router.push("/notifications");
    return;
  }
  if (typeNorm === "group_join_accepted") {
    const groupId = payloadString(data, "groupId", "group_id");
    if (groupId.length > 0) {
      router.push({ pathname: "/group/[groupId]", params: { groupId } });
      return;
    }
  }
  if (typeNorm === "group_post" || typeNorm === "group_announcement") {
    const groupId = payloadString(data, "groupId", "group_id");
    if (groupId.length > 0) {
      router.push({
        pathname: "/group/[groupId]",
        params: { groupId },
      });
      return;
    }
  }
  if (typeNorm === "post_liked" || typeNorm === "post_commented") {
    const groupId = payloadString(data, "groupId", "group_id");
    const postId = payloadString(data, "postId", "post_id");
    const commentId = payloadString(data, "commentId", "comment_id");
    const replyToCommentId = payloadString(
      data,
      "replyToCommentId",
      "reply_to_comment_id",
    );
    if (groupId.length > 0) {
      router.push({
        pathname: "/group/[groupId]",
        params: {
          groupId,
          ...(postId ? { postId } : {}),
          ...(commentId ? { commentId } : {}),
          ...(replyToCommentId ? { replyToCommentId } : {}),
        },
      });
      return;
    }
    router.push({
      pathname: "/(tabs)/profile",
      params: {
        ...(postId ? { postId } : {}),
        ...(commentId ? { commentId } : {}),
        ...(replyToCommentId ? { replyToCommentId } : {}),
      },
    });
    return;
  }
  if (typeNorm === "profile_post") {
    const postId = payloadString(data, "postId", "post_id");
    router.push({
      pathname: "/(tabs)/profile",
      params: {
        ...(postId ? { postId } : {}),
      },
    });
    return;
  }
}

const COLD_START_DELAY_MS = 600;

/**
 * Handles notification taps: chat pushes open fullscreen group chat; invite/RSVP open round detail;
 * follow requests open Notifications.
 *
 * Cold-start taps (getLastNotificationResponseAsync) are delayed until Clerk has
 * loaded and the initial route redirect (IndexGate) has settled, preventing
 * navigation into an unresolved Stack.
 */
export function NotificationDeepLinkEffects() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const pendingColdStart = useRef<Record<string, unknown> | null>(null);
  const coldStartHandled = useRef(false);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      openNotificationData(
        router,
        (response.notification.request.content.data as Record<string, unknown>) ?? {},
      );
    });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response || coldStartHandled.current) return;
      pendingColdStart.current =
        (response.notification.request.content.data as Record<string, unknown>) ?? {};
    });

    return () => sub.remove();
  }, [router]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !pendingColdStart.current || coldStartHandled.current) return;
    coldStartHandled.current = true;
    const data = pendingColdStart.current;
    pendingColdStart.current = null;
    const timer = setTimeout(() => openNotificationData(router, data), COLD_START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isLoaded, isSignedIn, router]);

  return null;
}
