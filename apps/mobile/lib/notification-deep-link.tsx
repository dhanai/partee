import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { useEffect, useRef } from "react";

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
    const hostJoinRequests =
      type === "round_rsvp" &&
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
  if (type === "post_liked" || type === "post_commented") {
    const groupId = typeof data.groupId === "string" ? data.groupId.trim() : "";
    const postId = typeof data.postId === "string" ? data.postId.trim() : "";
    const commentId = typeof data.commentId === "string" ? data.commentId.trim() : "";
    const replyToCommentId =
      typeof data.replyToCommentId === "string" ? data.replyToCommentId.trim() : "";
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
  if (type === "profile_post") {
    const postId = typeof data.postId === "string" ? data.postId.trim() : "";
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
