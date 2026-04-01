import { useFocusEffect, useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { subscribeNotificationsListsRefresh } from "../lib/notifications-list-refresh";
import { ActivityIndicator, Image, Pressable, RefreshControl, FlatList, StyleSheet, Text, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { apiDelete, apiGet, apiPatch, apiPost, toAbsoluteUrl } from "../lib/api";
import {
  parseRoundListHint,
  prefetchRoundOpen,
} from "../lib/round-details-cache";
import { formatHostRsvpBodyLocal, type RoundRsvpNotificationMeta } from "../lib/host-rsvp-notification-copy";
import { useNotificationBadge } from "../lib/notification-badge-context";
import { colors } from "../lib/theme";

type FollowRequestsResponse = {
  requests: Array<{
    id: string;
    followerId: string;
    name: string;
    avatar: string | null;
    createdAt: string;
  }>;
};

type ActivityNotificationItem = {
  id: string;
  type:
    | "round_invite"
    | "round_rsvp_accepted"
    | "round_rsvp_declined"
    | "group_join_request"
    | "new_follower"
    | "post_liked"
    | "post_commented"
    | "group_post"
    | "profile_post";
  title: string;
  body: string;
  inviteToken: string;
  groupId: string;
  postId: string;
  commentId: string;
  parentCommentId: string;
  replyToCommentId: string;
  actorUserId: string;
  actorName: string;
  actorAvatar: string | null;
  stillPending: boolean;
  joinRequestId: string | null;
  createdAt: string;
  previewImageUrl?: string;
  roundRsvpMeta?: RoundRsvpNotificationMeta;
  /** Live round bootstrap JSON — matches `/api/rounds/:token` when round still exists */
  roundHint?: string;
};

type ActivityNotificationsResponse = {
  items: ActivityNotificationItem[];
};

function formatNotificationTime(iso: string): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "";
  const diffSeconds = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (diffSeconds < 60) return `${diffSeconds}s`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) return `${diffWeeks}w`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo`;
  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears}y`;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { markNotificationsSeen, refresh: refreshNotificationBadge } = useNotificationBadge();
  const markSeenRef = useRef(markNotificationsSeen);
  markSeenRef.current = markNotificationsSeen;
  const getTokenRef = useRef(getToken);
  const [loading, setLoading] = useState(true);
  const [activityItems, setActivityItems] = useState<ActivityNotificationItem[]>([]);
  const [followRequestNotifications, setFollowRequestNotifications] = useState<
    FollowRequestsResponse["requests"]
  >([]);
  const [requestBusyId, setRequestBusyId] = useState<string | null>(null);
  const [groupRequestBusyId, setGroupRequestBusyId] = useState<string | null>(null);
  const [followBackBusyId, setFollowBackBusyId] = useState<string | null>(null);
  const [followedBackUserIds, setFollowedBackUserIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const fetchNotificationsData = useCallback(async () => {
    const authToken = await getTokenRef.current();
    const [followRes, activityRes] = await Promise.allSettled([
      apiGet<FollowRequestsResponse>("/api/users/me/follow-requests", authToken),
      apiGet<ActivityNotificationsResponse>("/api/users/me/activity-notifications", authToken),
    ]);

    if (followRes.status === "fulfilled") {
      setFollowRequestNotifications(followRes.value.requests ?? []);
    } else {
      setFollowRequestNotifications([]);
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.warn("[notifications] follow-requests failed", followRes.reason);
      }
    }

    if (activityRes.status === "fulfilled") {
      setActivityItems(activityRes.value.items ?? []);
    } else {
      setActivityItems([]);
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.warn("[notifications] activity-notifications failed", activityRes.reason);
      }
    }

    const rejected = [followRes, activityRes].filter((r) => r.status === "rejected");
    if (rejected.length === 2) {
      const first = rejected[0] as PromiseRejectedResult;
      const msg =
        first.reason instanceof Error
          ? first.reason.message
          : "Unable to load notifications.";
      throw new Error(msg);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const run = async () => {
        const hasRows = activityItems.length > 0 || followRequestNotifications.length > 0;
        if (!hasRows) setLoading(true);
        setError(null);
        try {
          await fetchNotificationsData();
          if (cancelled) return;
          await markSeenRef.current();
        } catch (loadError) {
          if (!cancelled) {
            setError(
              loadError instanceof Error ? loadError.message : "Unable to load notifications.",
            );
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      };

      void run();
      return () => {
        cancelled = true;
      };
    }, [activityItems.length, fetchNotificationsData, followRequestNotifications.length]),
  );

  useEffect(() => {
    return subscribeNotificationsListsRefresh(() => {
      void fetchNotificationsData().catch(() => {
        // Silent refresh (e.g. Ably nudge while another tab is visible).
      });
    });
  }, [fetchNotificationsData]);

  async function handleFollowRequestAction(
    followerId: string,
    action: "approve" | "decline",
  ) {
    setRequestBusyId(followerId);
    try {
      const authToken = await getTokenRef.current();
      await apiPost(`/api/users/me/follow-requests/${followerId}`, { action }, authToken);
      setFollowRequestNotifications((prev) =>
        prev.filter((request) => request.followerId !== followerId),
      );
      await refreshNotificationBadge();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to update request.");
    } finally {
      setRequestBusyId(null);
    }
  }

  async function handleGroupRequestAction(
    groupId: string,
    joinRequestId: string,
    action: "accept" | "decline",
  ) {
    setGroupRequestBusyId(joinRequestId);
    try {
      const authToken = await getTokenRef.current();
      await apiPatch(`/api/groups/${groupId}/requests`, { requestId: joinRequestId, action }, authToken);
      setActivityItems((prev) =>
        prev.map((item) =>
          item.joinRequestId === joinRequestId
            ? { ...item, stillPending: false }
            : item,
        ),
      );
      await refreshNotificationBadge();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to process request.");
    } finally {
      setGroupRequestBusyId(null);
    }
  }

  const handleFollowBack = useCallback(async (actorUserId: string) => {
    const userId = actorUserId.trim();
    if (!userId || followBackBusyId === userId || followedBackUserIds.has(userId)) return;
    setFollowBackBusyId(userId);
    try {
      const authToken = await getTokenRef.current();
      await apiPost(`/api/users/${encodeURIComponent(userId)}/follow`, {}, authToken);
      setFollowedBackUserIds((prev) => new Set(prev).add(userId));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to follow back.");
    } finally {
      setFollowBackBusyId(null);
    }
  }, [followBackBusyId, followedBackUserIds]);

  type FeedRow =
    | {
        id: string;
        kind: "activity";
        createdAt: string;
        item: ActivityNotificationItem;
      }
    | {
        id: string;
        kind: "follow_request";
        createdAt: string;
        request: FollowRequestsResponse["requests"][number];
      };

  const feedRows = useMemo(() => {
    const activityRows: FeedRow[] = activityItems.map((item) => ({
      id: `activity-${item.id}`,
      kind: "activity",
      createdAt: item.createdAt,
      item,
    }));
    const followRows: FeedRow[] = followRequestNotifications.map((request) => ({
      id: `follow-${request.id}`,
      kind: "follow_request",
      createdAt: request.createdAt,
      request,
    }));
    return [...activityRows, ...followRows].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [activityItems, followRequestNotifications]);

  const openPostNotification = useCallback(
    (item: ActivityNotificationItem) => {
      if (item.groupId) {
        router.push({
          pathname: "/group/[groupId]",
          params: {
            groupId: item.groupId,
            ...(item.postId ? { postId: item.postId } : {}),
            ...(item.commentId ? { commentId: item.commentId } : {}),
            ...(item.replyToCommentId ? { replyToCommentId: item.replyToCommentId } : {}),
          },
        });
        return;
      }
      router.push({
        pathname: "/(tabs)/profile",
        params: {
          ...(item.postId ? { postId: item.postId } : {}),
          ...(item.commentId ? { commentId: item.commentId } : {}),
          ...(item.replyToCommentId ? { replyToCommentId: item.replyToCommentId } : {}),
        },
      });
    },
    [router],
  );

  const dismissActivityNotification = useCallback(
    async (id: string) => {
      const snapshot = activityItems;
      setActivityItems((prev) => prev.filter((item) => item.id !== id));
      try {
        const authToken = await getTokenRef.current();
        await apiDelete(`/api/users/me/activity-notifications/${id}`, authToken);
        await refreshNotificationBadge();
      } catch {
        setActivityItems(snapshot);
      }
    },
    [activityItems, refreshNotificationBadge],
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchNotificationsData();
    } catch {
      // silent
    } finally {
      setRefreshing(false);
    }
  }, [fetchNotificationsData]);

  const openRoundNotification = useCallback(
    (item: ActivityNotificationItem) => {
      router.push({
        pathname: "/round/[token]",
        params: {
          token: item.inviteToken,
          ...(item.roundHint ? { roundHint: item.roundHint } : {}),
        },
      });
    },
    [router],
  );

  const resolveNotificationPreview = useCallback((item: ActivityNotificationItem) => {
    const direct = item.previewImageUrl?.trim();
    if (direct) return toAbsoluteUrl(direct);
    const fromHint =
      item.roundHint && item.roundHint.length > 0 ? parseRoundListHint(item.roundHint)?.imageUrl : "";
    return fromHint ? toAbsoluteUrl(fromHint) : null;
  }, []);

  const renderMetaInline = useCallback((message: string, timeLabel: string) => {
    return (
      <Text style={styles.notificationMeta} numberOfLines={3}>
        {message}
        {timeLabel ? <Text style={styles.notificationTimeInline}> {timeLabel}</Text> : null}
      </Text>
    );
  }, []);

  const renderActorAvatar = useCallback(
    (avatar: string | null, fallbackIcon: keyof typeof Ionicons.glyphMap, fallbackSize = 14) => {
      if (avatar) {
        return <Image source={{ uri: toAbsoluteUrl(avatar) }} style={styles.notificationAvatar} />;
      }
      return (
        <View style={[styles.notificationAvatar, styles.notificationAvatarFallback]}>
          <Ionicons name={fallbackIcon} size={fallbackSize} color={colors.fairway} />
        </View>
      );
    },
    [],
  );

  const renderRightAccessory = useCallback((previewUri: string | null, ctaLabel = "View") => {
    if (previewUri) {
      return <Image source={{ uri: previewUri }} style={styles.notificationThumb} />;
    }
    return (
      <View style={styles.notificationInlineCta}>
        <Text style={styles.notificationInlineCtaText}>{ctaLabel}</Text>
      </View>
    );
  }, []);

  const renderActorTemplateCard = useCallback(
    (input: {
      actorAvatar: string | null;
      fallbackIcon: keyof typeof Ionicons.glyphMap;
      fallbackSize?: number;
      title: string;
      subtitle: string;
      timeLabel: string;
      onPress: () => void;
      right?: ReactNode;
    }) => {
      return (
        <Pressable style={styles.notificationCard} onPress={input.onPress}>
          <View style={styles.notificationRow}>
            {renderActorAvatar(input.actorAvatar, input.fallbackIcon, input.fallbackSize)}
            <View style={styles.notificationRowText}>
              <Text style={styles.notificationTitle} numberOfLines={1}>
                {input.title}
              </Text>
              {renderMetaInline(input.subtitle, input.timeLabel)}
            </View>
            {input.right}
          </View>
        </Pressable>
      );
    },
    [renderActorAvatar, renderMetaInline],
  );

  const renderActivityCard = useCallback(
    (item: ActivityNotificationItem) => {
      if (item.type === "new_follower") {
        const followBackId = item.actorUserId?.trim() ?? "";
        const followedBack = followBackId.length > 0 && followedBackUserIds.has(followBackId);
        const isBusy = followBackId.length > 0 && followBackBusyId === followBackId;
        const timeLabel = formatNotificationTime(item.createdAt);
        return (
          <View style={styles.notificationCard}>
            <View style={styles.notificationRow}>
              <Pressable
                style={styles.notificationRowTextTap}
                onPress={() =>
                  router.push({
                    pathname: "/profile/[userId]",
                    params: { userId: item.actorUserId },
                  })
                }
              >
                <View style={styles.notificationRowLeft}>
                  {item.actorAvatar ? (
                    <Image
                      source={{ uri: toAbsoluteUrl(item.actorAvatar) }}
                      style={styles.notificationAvatar}
                    />
                  ) : (
                    <View style={[styles.notificationAvatar, styles.notificationAvatarFallback]}>
                      <Ionicons name="person" size={16} color={colors.fairway} />
                    </View>
                  )}
                  <View style={styles.notificationRowText}>
                    <Text style={styles.notificationTitle} numberOfLines={1}>
                      {item.actorName}
                    </Text>
                    {renderMetaInline("Started following you", timeLabel)}
                  </View>
                </View>
              </Pressable>
              <Pressable
                style={[
                  styles.followBackBtn,
                  followedBack && styles.followBackBtnDone,
                  (isBusy || followedBack) && styles.disabledBtn,
                ]}
                onPress={() => void handleFollowBack(followBackId)}
                disabled={isBusy || followedBack || followBackId.length === 0}
              >
                {isBusy ? (
                  <ActivityIndicator size="small" color={colors.fairway} />
                ) : (
                  <Text style={[styles.followBackBtnText, followedBack && styles.followBackBtnTextDone]}>
                    {followedBack ? "Following" : "Follow back"}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        );
      }
      if (item.type === "round_invite") {
        const previewUri = resolveNotificationPreview(item);
        const timeLabel = formatNotificationTime(item.createdAt);
        return renderActorTemplateCard({
          actorAvatar: item.actorAvatar,
          fallbackIcon: "mail-outline",
          fallbackSize: 15,
          title: item.title || "Round invite",
          subtitle: item.body,
          timeLabel,
          onPress: () => openRoundNotification(item),
          right: renderRightAccessory(previewUri, "View"),
        });
      }
      if (item.type === "post_liked") {
        const previewUri = resolveNotificationPreview(item);
        const timeLabel = formatNotificationTime(item.createdAt);
        return renderActorTemplateCard({
          actorAvatar: item.actorAvatar,
          fallbackIcon: "heart",
          title: item.actorName,
          subtitle: "Liked your post",
          timeLabel,
          onPress: () => openPostNotification(item),
          right: renderRightAccessory(previewUri, "View"),
        });
      }
      if (item.type === "post_commented") {
        const isReply = Boolean(item.replyToCommentId || item.parentCommentId);
        const previewUri = resolveNotificationPreview(item);
        const timeLabel = formatNotificationTime(item.createdAt);
        return renderActorTemplateCard({
          actorAvatar: item.actorAvatar,
          fallbackIcon: "chatbubble-outline",
          title: item.actorName,
          subtitle: isReply ? "Replied to your comment" : "Commented on your post",
          timeLabel,
          onPress: () => openPostNotification(item),
          right: renderRightAccessory(previewUri, "View"),
        });
      }
      if (item.type === "group_post") {
        const previewUri = resolveNotificationPreview(item);
        const timeLabel = formatNotificationTime(item.createdAt);
        return renderActorTemplateCard({
          actorAvatar: item.actorAvatar,
          fallbackIcon: "people",
          title: item.actorName,
          subtitle: "Posted in your group",
          timeLabel,
          onPress: () => {
            if (item.groupId) {
              router.push({
                pathname: "/group/[groupId]",
                params: { groupId: item.groupId, ...(item.postId ? { postId: item.postId } : {}) },
              });
            }
          },
          right: renderRightAccessory(previewUri, "View"),
        });
      }
      if (item.type === "profile_post") {
        const previewUri = resolveNotificationPreview(item);
        const timeLabel = formatNotificationTime(item.createdAt);
        return renderActorTemplateCard({
          actorAvatar: item.actorAvatar,
          fallbackIcon: "create-outline",
          title: item.actorName,
          subtitle: "Posted on your profile",
          timeLabel,
          onPress: () =>
            router.push({
              pathname: "/(tabs)/profile",
              params: { ...(item.postId ? { postId: item.postId } : {}) },
            }),
          right: renderRightAccessory(previewUri, "View"),
        });
      }
      if (item.type === "round_rsvp_accepted" || item.type === "round_rsvp_declined") {
        const rsvpBody = item.roundRsvpMeta
          ? formatHostRsvpBodyLocal(item.actorName ?? "", item.roundRsvpMeta)
          : item.body;
        const rsvpCover =
          item.roundHint != null && item.roundHint.length > 0
            ? parseRoundListHint(item.roundHint)?.imageUrl ?? ""
            : "";
        const timeLabel = formatNotificationTime(item.createdAt);
        const isDeclined = item.type === "round_rsvp_declined";
        return (
          <Pressable
            style={styles.notificationCard}
            onPressIn={() =>
              prefetchRoundOpen(item.inviteToken, rsvpCover, () => getTokenRef.current())
            }
            onPress={() =>
              openRoundNotification(item)
            }
          >
            <View style={styles.notificationRow}>
              {item.actorAvatar ? (
                <Image
                  source={{ uri: toAbsoluteUrl(item.actorAvatar) }}
                  style={styles.notificationAvatar}
                />
              ) : (
                <View style={[styles.notificationAvatar, styles.notificationAvatarFallback]}>
                  <Ionicons name="person" size={16} color={colors.fairway} />
                </View>
              )}
              <View style={styles.notificationRowText}>
                <Text style={styles.notificationTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                {renderMetaInline(rsvpBody, timeLabel)}
              </View>
              <View style={[styles.notificationInlineCta, isDeclined && styles.notificationInlineCtaMuted]}>
                <Text
                  style={[
                    styles.notificationInlineCtaText,
                    isDeclined && styles.notificationInlineCtaTextMuted,
                  ]}
                >
                  {isDeclined ? "Declined" : "RSVP"}
                </Text>
              </View>
            </View>
          </Pressable>
        );
      }
      if (item.type === "group_join_request") {
        const timeLabel = formatNotificationTime(item.createdAt);
        return (
          <View style={styles.notificationCard}>
            <Pressable
              style={styles.notificationRow}
              onPress={() => {
                if (item.actorUserId) {
                  router.push({
                    pathname: "/profile/[userId]",
                    params: {
                      userId: item.actorUserId,
                      userName: item.actorName,
                      userAvatar: item.actorAvatar ?? "",
                    },
                  });
                }
              }}
            >
              {item.actorAvatar ? (
                <Image source={{ uri: toAbsoluteUrl(item.actorAvatar) }} style={styles.notificationAvatar} />
              ) : (
                <View style={[styles.notificationAvatar, styles.notificationAvatarFallback]}>
                  <Text style={styles.notificationAvatarInitial}>
                    {(item.actorName ?? "?").trim().charAt(0).toUpperCase() || "?"}
                  </Text>
                </View>
              )}
              <View style={styles.notificationMetaWrap}>
                <Text style={styles.notificationTitle} numberOfLines={1}>
                  {item.actorName || item.title}
                </Text>
                {renderMetaInline(`Wants to join ${item.title}`, timeLabel)}
              </View>
            </Pressable>
            {item.stillPending && item.joinRequestId ? (
              <View style={styles.notificationActionsRow}>
                <Pressable
                  style={[
                    styles.requestBtn,
                    styles.requestApprove,
                    groupRequestBusyId === item.joinRequestId && styles.disabledBtn,
                  ]}
                  onPress={() =>
                    void handleGroupRequestAction(item.groupId, item.joinRequestId!, "accept")
                  }
                  disabled={groupRequestBusyId === item.joinRequestId}
                >
                  <Text style={styles.requestApproveText}>Approve</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.requestBtn,
                    styles.requestDecline,
                    groupRequestBusyId === item.joinRequestId && styles.disabledBtn,
                  ]}
                  onPress={() =>
                    void handleGroupRequestAction(item.groupId, item.joinRequestId!, "decline")
                  }
                  disabled={groupRequestBusyId === item.joinRequestId}
                >
                  <Text style={styles.requestDeclineText}>Decline</Text>
                </Pressable>
              </View>
            ) : !item.stillPending ? (
              <Text style={[styles.notificationPill, styles.notificationPillMuted]}>Handled</Text>
            ) : null}
          </View>
        );
      }
      return null;
    },
    [
      followBackBusyId,
      followedBackUserIds,
      groupRequestBusyId,
      handleGroupRequestAction,
      handleFollowBack,
      openPostNotification,
      openRoundNotification,
      renderActorTemplateCard,
      renderActorAvatar,
      renderRightAccessory,
      renderMetaInline,
      resolveNotificationPreview,
      router,
    ],
  );

  const renderFollowRequestCard = useCallback(
    (request: FollowRequestsResponse["requests"][number]) => {
      const timeLabel = formatNotificationTime(request.createdAt);
      return (
        <View style={styles.notificationCard}>
          <Pressable
            style={styles.notificationRow}
            onPress={() =>
              router.push({
                pathname: "/profile/[userId]",
                params: {
                  userId: request.followerId,
                  userName: request.name,
                  userAvatar: request.avatar ?? "",
                },
              })
            }
          >
            {request.avatar ? (
              <Image source={{ uri: toAbsoluteUrl(request.avatar) }} style={styles.notificationAvatar} />
            ) : (
              <View style={[styles.notificationAvatar, styles.notificationAvatarFallback]}>
                <Text style={styles.notificationAvatarInitial}>
                  {(request.name ?? "?").trim().charAt(0).toUpperCase() || "?"}
                </Text>
              </View>
            )}
            <View style={styles.notificationMetaWrap}>
              <Text style={styles.notificationTitle} numberOfLines={1}>
                {request.name}
              </Text>
              {renderMetaInline("Wants to follow your profile", timeLabel)}
            </View>
          </Pressable>
          <View style={styles.notificationActionsRow}>
            <Pressable
              style={[
                styles.requestBtn,
                styles.requestApprove,
                requestBusyId === request.followerId && styles.disabledBtn,
              ]}
              onPress={() => void handleFollowRequestAction(request.followerId, "approve")}
              disabled={requestBusyId === request.followerId}
            >
              <Text style={styles.requestApproveText}>Approve</Text>
            </Pressable>
            <Pressable
              style={[
                styles.requestBtn,
                styles.requestDecline,
                requestBusyId === request.followerId && styles.disabledBtn,
              ]}
              onPress={() => void handleFollowRequestAction(request.followerId, "decline")}
              disabled={requestBusyId === request.followerId}
            >
              <Text style={styles.requestDeclineText}>Decline</Text>
            </Pressable>
          </View>
        </View>
      );
    },
    [handleFollowRequestAction, renderMetaInline, requestBusyId, router],
  );

  const renderItem = useCallback(
    ({ item: row }: { item: FeedRow }) => {
      if (row.kind === "follow_request") {
        const request = row.request;
        return (
          <View style={styles.notificationRowWrap}>{renderFollowRequestCard(request)}</View>
        );
      }
      const activity = row.item;
      const rightAction = () => (
        <Pressable
          style={styles.dismissAction}
          onPress={() => void dismissActivityNotification(activity.id)}
        >
          <Ionicons name="trash-outline" size={16} color="#fff" />
          <Text style={styles.dismissActionText}>Dismiss</Text>
        </Pressable>
      );
      return (
        <Swipeable renderRightActions={rightAction} overshootRight={false}>
          <View style={styles.notificationRowWrap}>{renderActivityCard(activity)}</View>
        </Swipeable>
      );
    },
    [dismissActivityNotification, renderActivityCard, renderFollowRequestCard],
  );

  const keyExtractor = useCallback((row: FeedRow) => row.id, []);

  const isEmpty = !loading && followRequestNotifications.length === 0 && activityItems.length === 0;
  const showInitialLoader = loading && feedRows.length === 0 && !refreshing;

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={feedRows}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.fairway} />
      }
      ListHeaderComponent={error ? <Text style={styles.errorText}>{error}</Text> : null}
      ListEmptyComponent={
        showInitialLoader ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.fairway} />
          </View>
        ) : isEmpty ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="notifications-off-outline" size={18} color={colors.fairway} />
            </View>
            <Text style={styles.emptyTitle}>All caught up</Text>
            <Text style={styles.emptyText}>
              No new notifications right now.
            </Text>
            <View style={styles.emptyActionsRow}>
              <Pressable
                style={styles.emptySecondaryBtn}
                onPress={() => {
                  router.back();
                  setTimeout(() => router.navigate("/(tabs)"), 50);
                }}
              >
                <Text style={styles.emptySecondaryBtnText}>Browse Discover</Text>
              </Pressable>
              <Pressable
                style={styles.emptyPrimaryBtn}
                onPress={() => {
                  router.back();
                  setTimeout(
                    () =>
                      router.navigate({
                        pathname: "/(tabs)/rounds",
                        params: { tab: "invited", refresh: String(Date.now()) },
                      }),
                    50,
                  );
                }}
              >
                <Text style={styles.emptyPrimaryBtnText}>Open Invited</Text>
              </Pressable>
            </View>
          </View>
        ) : null
      }
      keyboardShouldPersistTaps="handled"
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 10, paddingBottom: 32 },
  loadingWrap: { paddingVertical: 24, alignItems: "center" },
  errorText: {
    color: colors.danger,
    backgroundColor: "#fee4e2",
    padding: 10,
    borderRadius: 12,
    marginBottom: 4,
  },
  emptyCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    gap: 8,
    alignItems: "flex-start",
  },
  emptyIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.fairwaySoft,
  },
  emptyTitle: { color: colors.text, fontWeight: "700", fontSize: 17 },
  emptyText: { color: colors.muted },
  emptyActionsRow: { flexDirection: "row", gap: 8, marginTop: 2 },
  emptyPrimaryBtn: {
    backgroundColor: colors.fairway,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  emptyPrimaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  emptySecondaryBtn: {
    backgroundColor: "#ece8e1",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  emptySecondaryBtnText: { color: colors.text, fontWeight: "700", fontSize: 12 },
  notificationRowWrap: { marginBottom: 8 },
  notificationCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#faf8f5",
    padding: 10,
    gap: 4,
  },
  notificationTitle: { color: colors.text, fontWeight: "700", flexShrink: 1 },
  notificationRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  notificationRowLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  notificationRowTextTap: { flex: 1, minWidth: 0, marginRight: 8 },
  notificationRowText: { flex: 1, minWidth: 0, marginRight: 8 },
  notificationMetaWrap: { flex: 1 },
  notificationAvatar: { width: 30, height: 30, borderRadius: 999 },
  notificationAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.fairwaySoft,
    borderWidth: 1,
    borderColor: "#d9e8dc",
  },
  notificationAvatarInitial: { color: colors.fairway, fontSize: 12, fontWeight: "700" },
  notificationMeta: { color: colors.muted, fontSize: 12, flexShrink: 1 },
  notificationTimeInline: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  notificationThumb: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: colors.fairwaySoft,
    flexShrink: 0,
  },
  notificationInlineCta: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#ece8e1",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 56,
    height: 32,
    flexShrink: 0,
  },
  notificationInlineCtaText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 12,
  },
  notificationInlineCtaMuted: {
    backgroundColor: "#f1efea",
  },
  notificationInlineCtaTextMuted: {
    color: colors.muted,
  },
  notificationPill: {
    alignSelf: "flex-start",
    marginTop: 2,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.fairwaySoft,
    color: colors.fairway,
    fontSize: 11,
    fontWeight: "700",
    overflow: "hidden",
  },
  notificationPillMuted: {
    backgroundColor: "#ece8e1",
    color: colors.muted,
  },
  notificationActionsRow: { flexDirection: "row", gap: 8, marginTop: 2 },
  requestBtn: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  requestApprove: { backgroundColor: colors.fairwaySoft },
  requestApproveText: { color: colors.fairway, fontWeight: "700", fontSize: 12 },
  requestDecline: { backgroundColor: "#ece8e1" },
  requestDeclineText: { color: colors.text, fontWeight: "700", fontSize: 12 },
  followBackBtn: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.fairwaySoft,
    width: 96,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  followBackBtnDone: {
    backgroundColor: "#ece8e1",
  },
  followBackBtnText: {
    color: colors.fairway,
    fontWeight: "700",
    fontSize: 12,
  },
  followBackBtnTextDone: {
    color: colors.muted,
  },
  disabledBtn: { opacity: 0.55 },
  dismissAction: {
    marginBottom: 8,
    width: 84,
    borderRadius: 12,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  dismissActionText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 11,
  },
});
