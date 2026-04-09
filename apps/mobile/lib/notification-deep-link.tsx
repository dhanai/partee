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
    if (Array.isArray(v) && v.length > 0) {
      const first = v[0];
      if (typeof first === "string" && first.trim().length > 0) return first.trim();
    }
  }
  return "";
}

/**
 * Merge nested `data`, optional trigger payload, and JSON string blobs — Android/FCM
 * and some Expo paths reshape the original `sendExpoPushMessages` object.
 */
function normalizePushData(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };

  const inner = raw.data;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    Object.assign(out, inner as Record<string, unknown>);
  }

  for (const key of ["body", "Body", "payload", "userInfo"] as const) {
    const v = out[key];
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (!s.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(s) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        Object.assign(out, parsed as Record<string, unknown>);
      }
    } catch {
      /* ignore */
    }
  }

  return out;
}

function extractDataFromResponse(response: Notifications.NotificationResponse): Record<string, unknown> {
  const content = response.notification.request.content;
  let data = (content.data as Record<string, unknown>) ?? {};

  const trigger = response.notification.request.trigger;
  if (trigger && typeof trigger === "object" && trigger !== null && "payload" in trigger) {
    const p = (trigger as { payload?: unknown }).payload;
    if (p && typeof p === "object" && !Array.isArray(p)) {
      data = { ...(p as Record<string, unknown>), ...data };
    }
  }

  return normalizePushData(data);
}

function openNotificationData(
  router: ReturnType<typeof useRouter>,
  data: Record<string, unknown>,
) {
  const normalized = normalizePushData(data);
  const type = payloadString(normalized, "type", "Type");
  const typeNorm = type.toLowerCase();
  const inviteToken = payloadString(normalized, "inviteToken", "invite_token");
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
      (normalized.spotStatus === "requested" ||
        normalized.hostJoinRequests === "1" ||
        normalized.hostJoinRequests === 1);
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
    const conversationId = payloadString(
      normalized,
      "conversationId",
      "conversation_id",
    );
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
    const groupId = payloadString(normalized, "groupId", "group_id");
    if (groupId.length > 0) {
      router.push({ pathname: "/group/[groupId]", params: { groupId } });
      return;
    }
  }
  if (typeNorm === "group_post" || typeNorm === "group_announcement") {
    const groupId = payloadString(normalized, "groupId", "group_id");
    if (groupId.length > 0) {
      router.push({
        pathname: "/group/[groupId]",
        params: { groupId },
      });
      return;
    }
  }
  if (typeNorm === "post_liked" || typeNorm === "post_commented") {
    const groupId = payloadString(normalized, "groupId", "group_id");
    const postId = payloadString(normalized, "postId", "post_id");
    const commentId = payloadString(normalized, "commentId", "comment_id");
    const replyToCommentId = payloadString(
      normalized,
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
    const profileWallUserId = payloadString(
      normalized,
      "profileUserId",
      "profile_user_id",
    );
    if (profileWallUserId.length > 0) {
      router.push({
        pathname: "/profile/[userId]",
        params: {
          userId: profileWallUserId,
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
    const postId = payloadString(normalized, "postId", "post_id");
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
 * Handles notification taps: chat pushes open the conversation; invite/RSVP open round detail;
 * follow requests open Notifications.
 *
 * Cold-start: `getLastNotificationResponseAsync` often resolves *after* Clerk reports signed-in,
 * so we stash the payload and navigate once both auth-ready and data exist. Uses a stable
 * router ref so navigation is not cancelled when `useRouter` identity changes.
 */
export function NotificationDeepLinkEffects() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const routerRef = useRef(router);
  routerRef.current = router;

  const authRef = useRef({ isLoaded: false, isSignedIn: false });
  authRef.current = { isLoaded, isSignedIn: Boolean(isSignedIn) };

  const pendingLaunch = useRef<Record<string, unknown> | null>(null);
  const launchConsumed = useRef(false);
  const coldStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tryConsumeLaunchNotification = () => {
    if (launchConsumed.current || !pendingLaunch.current) return;
    const { isLoaded: loaded, isSignedIn: signed } = authRef.current;
    if (!loaded || !signed) return;
    if (coldStartTimerRef.current) {
      clearTimeout(coldStartTimerRef.current);
      coldStartTimerRef.current = null;
    }
    launchConsumed.current = true;
    const data = pendingLaunch.current;
    pendingLaunch.current = null;
    coldStartTimerRef.current = setTimeout(() => {
      coldStartTimerRef.current = null;
      openNotificationData(routerRef.current, data);
    }, COLD_START_DELAY_MS);
  };

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      openNotificationData(routerRef.current, extractDataFromResponse(response));
    });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response || launchConsumed.current) return;
      pendingLaunch.current = extractDataFromResponse(response);
      tryConsumeLaunchNotification();
    });

    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!isSignedIn) {
      if (coldStartTimerRef.current) {
        clearTimeout(coldStartTimerRef.current);
        coldStartTimerRef.current = null;
      }
      launchConsumed.current = false;
      pendingLaunch.current = null;
      return;
    }
    tryConsumeLaunchNotification();
  }, [isLoaded, isSignedIn]);

  useEffect(
    () => () => {
      if (coldStartTimerRef.current) {
        clearTimeout(coldStartTimerRef.current);
        coldStartTimerRef.current = null;
      }
    },
    [],
  );

  return null;
}
