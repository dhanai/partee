import { useFocusEffect, useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeNotificationsListsRefresh } from "../lib/notifications-list-refresh";
import { ActivityIndicator, Image, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";
import { apiGet, apiPatch, apiPost, toAbsoluteUrl } from "../lib/api";
import { buildRoundListHint, prefetchRoundOpen } from "../lib/round-details-cache";
import { formatPlanningWindow, getTimeWindows } from "../lib/round-card-meta";
import { useNotificationBadge } from "../lib/notification-badge-context";
import { colors } from "../lib/theme";
import { MineRound } from "../types/round";

type MineTabResponse = {
  tab: "hosting" | "joined" | "invited";
  rounds: MineRound[];
  nextCursor: string | null;
  hasMore: boolean;
};

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
  type: "round_rsvp_accepted" | "round_rsvp_declined" | "group_join_request" | "new_follower" | "post_liked";
  title: string;
  body: string;
  inviteToken: string;
  groupId: string;
  postId: string;
  actorUserId: string;
  actorName: string;
  actorAvatar: string | null;
  stillPending: boolean;
  joinRequestId: string | null;
  createdAt: string;
};

type ActivityNotificationsResponse = {
  items: ActivityNotificationItem[];
};

export default function NotificationsScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { markNotificationsSeen, refresh: refreshNotificationBadge } = useNotificationBadge();
  const markSeenRef = useRef(markNotificationsSeen);
  markSeenRef.current = markNotificationsSeen;
  const getTokenRef = useRef(getToken);
  const [loading, setLoading] = useState(true);
  const [inviteNotifications, setInviteNotifications] = useState<MineRound[]>([]);
  const [activityItems, setActivityItems] = useState<ActivityNotificationItem[]>([]);
  const [followRequestNotifications, setFollowRequestNotifications] = useState<
    FollowRequestsResponse["requests"]
  >([]);
  const [requestBusyId, setRequestBusyId] = useState<string | null>(null);
  const [groupRequestBusyId, setGroupRequestBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const fetchNotificationsData = useCallback(async () => {
    const authToken = await getTokenRef.current();
    const [mineRes, followRes, activityRes] = await Promise.allSettled([
      apiGet<MineTabResponse>(
        "/api/rounds/mine?tab=joined&limit=50&includeInvited=1",
        authToken,
      ),
      apiGet<FollowRequestsResponse>("/api/users/me/follow-requests", authToken),
      apiGet<ActivityNotificationsResponse>("/api/users/me/activity-notifications", authToken),
    ]);

    if (mineRes.status === "fulfilled") {
      const roundData = mineRes.value;
      setInviteNotifications(
        roundData.rounds.filter(
          (round) => round.spotStatus === "invited" || round.spotStatus === "requested",
        ),
      );
    } else {
      setInviteNotifications([]);
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.warn("[notifications] rounds/mine failed", mineRes.reason);
      }
    }

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

    const rejected = [mineRes, followRes, activityRes].filter((r) => r.status === "rejected");
    if (rejected.length === 3) {
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
        setLoading(true);
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
    }, [fetchNotificationsData]),
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

  function formatWhen(round: MineRound) {
    const effectiveDate = new Date(round.teeTime ?? round.targetDate);
    const dateText = effectiveDate.toLocaleDateString();
    if (round.mode === "scheduled" && round.teeTime) {
      return `${dateText} at ${new Date(round.teeTime).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })}`;
    }
    if (round.mode === "planning") {
      return formatPlanningWindow(getTimeWindows(round));
    }
    return `${dateText} • ${formatPlanningWindow(getTimeWindows(round))}`;
  }

  type SectionRow =
    | { kind: "group_request"; item: ActivityNotificationItem }
    | { kind: "new_follower"; item: ActivityNotificationItem }
    | { kind: "post_liked"; item: ActivityNotificationItem }
    | { kind: "round_update"; item: ActivityNotificationItem }
    | { kind: "follow_request"; request: FollowRequestsResponse["requests"][number] }
    | { kind: "round_invite"; round: MineRound };

  const sections = useMemo(() => {
    const result: { title: string; data: SectionRow[] }[] = [];
    const groupReqs = activityItems.filter((i) => i.type === "group_join_request");
    if (groupReqs.length > 0) {
      result.push({ title: "Group requests", data: groupReqs.map((item) => ({ kind: "group_request" as const, item })) });
    }
    const followers = activityItems.filter((i) => i.type === "new_follower");
    if (followers.length > 0) {
      result.push({ title: "New followers", data: followers.map((item) => ({ kind: "new_follower" as const, item })) });
    }
    const likes = activityItems.filter((i) => i.type === "post_liked");
    if (likes.length > 0) {
      result.push({ title: "Likes", data: likes.map((item) => ({ kind: "post_liked" as const, item })) });
    }
    const rsvps = activityItems.filter((i) => i.type === "round_rsvp_accepted" || i.type === "round_rsvp_declined");
    if (rsvps.length > 0) {
      result.push({ title: "Round updates", data: rsvps.map((item) => ({ kind: "round_update" as const, item })) });
    }
    if (followRequestNotifications.length > 0) {
      result.push({ title: "Follow requests", data: followRequestNotifications.map((request) => ({ kind: "follow_request" as const, request })) });
    }
    if (inviteNotifications.length > 0) {
      result.push({ title: "Round invites", data: inviteNotifications.map((round) => ({ kind: "round_invite" as const, round })) });
    }
    return result;
  }, [activityItems, followRequestNotifications, inviteNotifications]);

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

  const renderItem = useCallback(
    ({ item: row }: { item: SectionRow }) => {
      if (row.kind === "group_request") {
        const item = row.item;
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
                    {item.actorName.trim().charAt(0).toUpperCase() || "?"}
                  </Text>
                </View>
              )}
              <View style={styles.notificationMetaWrap}>
                <Text style={styles.notificationTitle}>{item.actorName || item.title}</Text>
                <Text style={styles.notificationMeta}>Wants to join {item.title}</Text>
              </View>
            </Pressable>
            {item.stillPending && item.joinRequestId ? (
              <View style={styles.notificationActionsRow}>
                <Pressable
                  style={[styles.requestBtn, styles.requestApprove, groupRequestBusyId === item.joinRequestId && styles.disabledBtn]}
                  onPress={() => void handleGroupRequestAction(item.groupId, item.joinRequestId!, "accept")}
                  disabled={groupRequestBusyId === item.joinRequestId}
                >
                  <Text style={styles.requestApproveText}>Approve</Text>
                </Pressable>
                <Pressable
                  style={[styles.requestBtn, styles.requestDecline, groupRequestBusyId === item.joinRequestId && styles.disabledBtn]}
                  onPress={() => void handleGroupRequestAction(item.groupId, item.joinRequestId!, "decline")}
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
      if (row.kind === "new_follower") {
        const item = row.item;
        return (
          <Pressable
            style={styles.notificationCard}
            onPress={() =>
              router.push({
                pathname: "/profile/[userId]",
                params: { userId: item.actorUserId },
              })
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
                <Text style={styles.notificationTitle}>{item.actorName}</Text>
                <Text style={styles.notificationMeta}>Started following you</Text>
              </View>
            </View>
          </Pressable>
        );
      }
      if (row.kind === "post_liked") {
        const item = row.item;
        return (
          <Pressable
            style={styles.notificationCard}
            onPress={() => {
              if (item.groupId) {
                router.push({
                  pathname: "/group/[groupId]",
                  params: { groupId: item.groupId },
                });
              }
            }}
          >
            <View style={styles.notificationRow}>
              {item.actorAvatar ? (
                <Image
                  source={{ uri: toAbsoluteUrl(item.actorAvatar) }}
                  style={styles.notificationAvatar}
                />
              ) : (
                <View style={[styles.notificationAvatar, styles.notificationAvatarFallback]}>
                  <Ionicons name="heart" size={14} color={colors.fairway} />
                </View>
              )}
              <View style={styles.notificationRowText}>
                <Text style={styles.notificationTitle}>{item.actorName}</Text>
                <Text style={styles.notificationMeta}>Liked your post</Text>
              </View>
            </View>
          </Pressable>
        );
      }
      if (row.kind === "round_update") {
        const item = row.item;
        return (
          <Pressable
            style={styles.notificationCard}
            onPressIn={() =>
              prefetchRoundOpen(item.inviteToken, "", () => getTokenRef.current())
            }
            onPress={() =>
              router.push({
                pathname: "/round/[token]",
                params: { token: item.inviteToken },
              })
            }
          >
            <Text style={styles.notificationTitle}>{item.title}</Text>
            <Text style={styles.notificationMeta}>{item.body}</Text>
            <Text
              style={[
                styles.notificationPill,
                item.type === "round_rsvp_declined" && styles.notificationPillMuted,
              ]}
            >
              {item.type === "round_rsvp_declined" ? "Declined" : "RSVP"}
            </Text>
          </Pressable>
        );
      }
      if (row.kind === "follow_request") {
        const request = row.request;
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
                    {request.name.trim().charAt(0).toUpperCase() || "?"}
                  </Text>
                </View>
              )}
              <View style={styles.notificationMetaWrap}>
                <Text style={styles.notificationTitle}>{request.name}</Text>
                <Text style={styles.notificationMeta}>Wants to follow your profile</Text>
              </View>
            </Pressable>
            <View style={styles.notificationActionsRow}>
              <Pressable
                style={[styles.requestBtn, styles.requestApprove, requestBusyId === request.followerId && styles.disabledBtn]}
                onPress={() => void handleFollowRequestAction(request.followerId, "approve")}
                disabled={requestBusyId === request.followerId}
              >
                <Text style={styles.requestApproveText}>Approve</Text>
              </Pressable>
              <Pressable
                style={[styles.requestBtn, styles.requestDecline, requestBusyId === request.followerId && styles.disabledBtn]}
                onPress={() => void handleFollowRequestAction(request.followerId, "decline")}
                disabled={requestBusyId === request.followerId}
              >
                <Text style={styles.requestDeclineText}>Decline</Text>
              </Pressable>
            </View>
          </View>
        );
      }
      // round_invite
      const round = row.round;
      return (
        <Pressable
          style={styles.notificationCard}
          onPressIn={() =>
            prefetchRoundOpen(round.inviteToken, round.imageUrl, () => getTokenRef.current())
          }
          onPress={() =>
            router.push({
              pathname: "/round/[token]",
              params: {
                token: round.inviteToken,
                roundHint: buildRoundListHint(round),
              },
            })
          }
        >
          <Text style={styles.notificationTitle}>{round.courseName ?? "Round invite"}</Text>
          <Text style={styles.notificationMeta}>{formatWhen(round)}</Text>
          <Text style={styles.notificationPill}>
            {round.spotStatus === "requested" ? "Request pending" : "Invited"}
          </Text>
        </Pressable>
      );
    },
    [groupRequestBusyId, requestBusyId, handleGroupRequestAction, handleFollowRequestAction, router],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: { title: string } }) => (
      <Text style={styles.sectionMiniTitle}>{section.title}</Text>
    ),
    [],
  );

  const keyExtractor = useCallback((row: SectionRow, index: number) => {
    if (row.kind === "follow_request") return `fr-${row.request.followerId}`;
    if (row.kind === "round_invite") return `inv-${row.round.id}`;
    return `${row.kind}-${row.item.id}-${index}`;
  }, []);

  const isEmpty =
    !loading &&
    inviteNotifications.length === 0 &&
    followRequestNotifications.length === 0 &&
    activityItems.length === 0;

  return (
    <SectionList
      style={styles.container}
      contentContainerStyle={styles.content}
      sections={sections}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      stickySectionHeadersEnabled={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.fairway} />
      }
      ListHeaderComponent={
        <>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={colors.fairway} />
            </View>
          ) : null}
        </>
      }
      ListEmptyComponent={
        !loading && isEmpty ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="notifications-off-outline" size={18} color={colors.fairway} />
            </View>
            <Text style={styles.emptyTitle}>All caught up</Text>
            <Text style={styles.emptyText}>
              No invites, follow requests, or round updates right now.
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
                  setTimeout(() => router.navigate({ pathname: "/(tabs)/rounds", params: { tab: "invited", refresh: String(Date.now()) } }), 50);
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
  notificationsList: { gap: 8 },
  sectionMiniTitle: {
    color: colors.muted,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    fontWeight: "700",
    marginTop: 2,
  },
  notificationCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#faf8f5",
    padding: 10,
    gap: 4,
  },
  notificationTitle: { color: colors.text, fontWeight: "700" },
  notificationRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  notificationRowText: { flex: 1, minWidth: 0 },
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
  notificationMeta: { color: colors.muted, fontSize: 12 },
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
  disabledBtn: { opacity: 0.55 },
});
