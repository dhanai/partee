import { useFocusEffect, useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeNotificationsListsRefresh } from "../lib/notifications-list-refresh";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { apiGet, apiPost, toAbsoluteUrl } from "../lib/api";
import { buildRoundListHint, prefetchRoundOpen } from "../lib/round-details-cache";
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

type ActivityNotificationsResponse = {
  items: Array<{
    id: string;
    type: "round_rsvp_accepted" | "round_rsvp_declined";
    title: string;
    body: string;
    inviteToken: string;
    createdAt: string;
  }>;
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
  const [activityItems, setActivityItems] = useState<ActivityNotificationsResponse["items"]>([]);
  const [followRequestNotifications, setFollowRequestNotifications] = useState<
    FollowRequestsResponse["requests"]
  >([]);
  const [requestBusyId, setRequestBusyId] = useState<string | null>(null);
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
      const slot = round.preferredTimeWindow
        ? `${round.preferredTimeWindow.charAt(0).toUpperCase()}${round.preferredTimeWindow.slice(1)}`
        : "Time TBD";
      return slot;
    }
    const slot = round.preferredTimeWindow
      ? `${round.preferredTimeWindow.charAt(0).toUpperCase()}${round.preferredTimeWindow.slice(1)}`
      : "Time TBD";
    return `${dateText} • ${slot}`;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sub}>Invites, follow requests, and round updates.</Text>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.fairway} />
        </View>
      ) : (
        <>
          {activityItems.length > 0 ? (
            <View style={styles.notificationsList}>
              <Text style={styles.sectionMiniTitle}>Round updates</Text>
              {activityItems.map((item) => (
                <Pressable
                  key={`activity-${item.id}`}
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
              ))}
            </View>
          ) : null}

          {followRequestNotifications.length > 0 ? (
            <View style={styles.notificationsList}>
              <Text style={styles.sectionMiniTitle}>Follow requests</Text>
              {followRequestNotifications.map((request) => (
                <View key={`follow-${request.id}`} style={styles.notificationCard}>
                  <View style={styles.notificationRow}>
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
                  </View>
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
              ))}
            </View>
          ) : null}

          {inviteNotifications.length > 0 ? (
            <View style={styles.notificationsList}>
              <Text style={styles.sectionMiniTitle}>Round invites</Text>
              {inviteNotifications.map((round) => (
                <Pressable
                  key={`invite-${round.id}`}
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
              ))}
            </View>
          ) : null}

          {inviteNotifications.length === 0 &&
          followRequestNotifications.length === 0 &&
          activityItems.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="notifications-off-outline" size={18} color={colors.fairway} />
              </View>
              <Text style={styles.emptyTitle}>All caught up</Text>
              <Text style={styles.emptyText}>
                No invites, follow requests, or round updates right now.
              </Text>
              <View style={styles.emptyActionsRow}>
                <Pressable style={styles.emptySecondaryBtn} onPress={() => router.push("/(tabs)")}>
                  <Text style={styles.emptySecondaryBtnText}>Browse Discover</Text>
                </Pressable>
                <Pressable
                  style={styles.emptyPrimaryBtn}
                  onPress={() =>
                    router.push({
                      pathname: "/(tabs)/rounds",
                      params: { tab: "invited", refresh: String(Date.now()) },
                    })
                  }
                >
                  <Text style={styles.emptyPrimaryBtnText}>Open Invited</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 10, paddingBottom: 32 },
  sub: { color: colors.muted, marginBottom: 2 },
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
