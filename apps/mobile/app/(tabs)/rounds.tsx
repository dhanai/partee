import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { NotificationMustardDot } from "../../components/notification-mustard-dot";
import { RoundListCard } from "../../components/round-list-card";
import { SwipeableMineRoundRow } from "../../components/swipeable-mine-round-row";
import { apiDelete, apiGet, apiPost } from "../../lib/api";
import { prefetchPublicProfile } from "../../lib/public-profile-cache";
import { buildRoundListHint, prefetchRoundOpen } from "../../lib/round-details-cache";
import {
  formatPlanningHeaderDate,
  formatPlanningWindow,
  formatScheduledCardMeta,
} from "../../lib/round-card-meta";
import { useNotificationBadge } from "../../lib/notification-badge-context";
import {
  applyOptimisticToMineRound,
  emitRoundListsShouldRefresh,
  subscribeRoundListsRefresh,
} from "../../lib/round-lists-refresh";
import { colors } from "../../lib/theme";
import { MineRound } from "../../types/round";

type MineTab = "hosting" | "joined" | "invited";

type MineTabResponse = {
  tab: MineTab;
  rounds: MineRound[];
  nextCursor: string | null;
  hasMore: boolean;
};

type InviteSpotResponse = "confirmed" | "requested" | "declined";

function sortMineByDate(a: MineRound, b: MineRound) {
  return (
    new Date(a.teeTime ?? a.targetDate).getTime() - new Date(b.teeTime ?? b.targetDate).getTime()
  );
}

/** Avoid duplicate React keys when pagination or optimistic merge overlaps. */
function appendUniqueMineRounds(prev: MineRound[], page: MineRound[]): MineRound[] {
  const seen = new Set(prev.map((r) => r.id));
  const out = [...prev];
  for (const r of page) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

function dedupeMineRoundsById(rows: MineRound[]): MineRound[] {
  const seen = new Set<string>();
  const out: MineRound[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

function withMeInConfirmed(
  players: MineRound["confirmedPlayers"] | undefined,
  me: { id: string; name: string; avatar: string | null },
): NonNullable<MineRound["confirmedPlayers"]> {
  const list = [...(players ?? [])];
  if (list.some((p) => p.id === me.id)) return list;
  list.push({ id: me.id, name: me.name, avatar: me.avatar });
  return list;
}

function upsertJoinedRoundSorted(prev: MineRound[], row: MineRound): MineRound[] {
  const idx = prev.findIndex((r) => r.id === row.id);
  const next = idx === -1 ? [...prev, row] : prev.map((r, i) => (i === idx ? row : r));
  next.sort(sortMineByDate);
  return next;
}

export default function MyRoundsScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const { getToken } = useAuth();
  const { showBadge: showNotificationBadge, refresh: refreshNotificationBadge } =
    useNotificationBadge();
  const params = useLocalSearchParams<{
    tab?: string | string[];
    refresh?: string | string[];
    createdToken?: string | string[];
  }>();
  const getTokenRef = useRef(getToken);
  const [hosting, setHosting] = useState<MineRound[]>([]);
  const [joined, setJoined] = useState<MineRound[]>([]);
  const [invited, setInvited] = useState<MineRound[]>([]);
  const [hostingCursor, setHostingCursor] = useState<string | null>(null);
  const [joinedCursor, setJoinedCursor] = useState<string | null>(null);
  const [invitedCursor, setInvitedCursor] = useState<string | null>(null);
  const [hostingHasMore, setHostingHasMore] = useState(true);
  const [joinedHasMore, setJoinedHasMore] = useState(true);
  const [invitedHasMore, setInvitedHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MineTab>("hosting");
  const activeTabRef = useRef<MineTab>("hosting");
  const lastHandledRefreshRef = useRef<string | null>(null);
  const [tabMetrics, setTabMetrics] = useState<{
    hosting: { x: number; width: number } | null;
    joined: { x: number; width: number } | null;
    invited: { x: number; width: number } | null;
  }>({
    hosting: null,
    joined: null,
    invited: null,
  });
  const tabLoadedRef = useRef<{ hosting: boolean; joined: boolean; invited: boolean }>({
    hosting: false,
    joined: false,
    invited: false,
  });
  /** Ignore stale `finally` from overlapping fetches for the same tab (focus + subscription + tab effect). */
  const fetchSeqRef = useRef<Record<MineTab, number>>({
    hosting: 0,
    joined: 0,
    invited: 0,
  });
  const underlineX = useRef(new Animated.Value(0)).current;
  const underlineW = useRef(new Animated.Value(0)).current;

  const [inviteResponseByRound, setInviteResponseByRound] = useState<
    Record<string, InviteSpotResponse>
  >({});
  const inviteResponseByRoundRef = useRef(inviteResponseByRound);
  inviteResponseByRoundRef.current = inviteResponseByRound;

  const [inviteActionRoundId, setInviteActionRoundId] = useState<string | null>(null);
  const [hostActionRoundId, setHostActionRoundId] = useState<string | null>(null);
  const lastHostEditNavAtRef = useRef(0);
  const [inviteRowError, setInviteRowError] = useState<Record<string, string>>({});
  /** Mail-style: no list scroll while a row owns the horizontal pan. */
  const [listScrollLockedForRowSwipe, setListScrollLockedForRowSwipe] = useState(false);

  const onRowSwipeActiveChange = useCallback((active: boolean) => {
    setListScrollLockedForRowSwipe(active);
  }, []);

  useEffect(() => {
    if (activeTab !== "hosting" && activeTab !== "invited") {
      setListScrollLockedForRowSwipe(false);
    }
  }, [activeTab]);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    const metric = tabMetrics[activeTab];
    if (!metric) return;
    Animated.parallel([
      Animated.timing(underlineX, {
        toValue: metric.x,
        duration: 180,
        useNativeDriver: false,
      }),
      Animated.timing(underlineW, {
        toValue: metric.width,
        duration: 180,
        useNativeDriver: false,
      }),
    ]).start();
  }, [activeTab, tabMetrics, underlineW, underlineX]);

  useEffect(() => {
    return subscribeRoundListsRefresh((payload) => {
      if (payload.optimistic) {
        const p = payload.optimistic;
        setHosting((prev) => prev.map((r) => applyOptimisticToMineRound(r, p)));
        setJoined((prev) => prev.map((r) => applyOptimisticToMineRound(r, p)));
        setInvited((prev) => prev.map((r) => applyOptimisticToMineRound(r, p)));
      }
      void loadTabRoundsRef.current(activeTabRef.current, { reset: true });
    });
  }, []);

  const roundsListFocusCountRef = useRef(0);
  useFocusEffect(
    useCallback(() => {
      roundsListFocusCountRef.current += 1;
      if (roundsListFocusCountRef.current > 1) {
        void loadTabRoundsRef.current(activeTabRef.current, { reset: true });
      }
    }, []),
  );

  useFocusEffect(
    useCallback(() => {
      const refreshParam = Array.isArray(params.refresh) ? params.refresh[0] : params.refresh;
      const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
      if (!refreshParam || lastHandledRefreshRef.current === refreshParam) return;

      lastHandledRefreshRef.current = refreshParam;
      const requestedTab: MineTab =
        tabParam === "invited" ? "invited" : tabParam === "joined" ? "joined" : "hosting";
      setActiveTab(requestedTab);

      if (requestedTab === "hosting") {
        setHostingCursor(null);
        setHostingHasMore(true);
        tabLoadedRef.current.hosting = false;
      } else if (requestedTab === "joined") {
        setJoinedCursor(null);
        setJoinedHasMore(true);
        tabLoadedRef.current.joined = false;
      } else {
        setInvitedCursor(null);
        setInvitedHasMore(true);
        tabLoadedRef.current.invited = false;
      }

      void loadTabRoundsRef.current(requestedTab, { reset: true });
    }, [params.refresh, params.tab]),
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRightContainerStyle: {
        paddingRight: 12,
      },
      headerRight: () => (
        <Pressable
          style={styles.headerBellBtn}
          onPress={() => router.push("/notifications")}
          accessibilityLabel={
            showNotificationBadge ? "Open notifications, has unread" : "Open notifications"
          }
        >
          <Ionicons name="notifications-outline" size={18} color={colors.fairway} />
          {showNotificationBadge ? (
            <NotificationMustardDot style={styles.headerBellDot} />
          ) : null}
        </Pressable>
      ),
    });
  }, [navigation, router, showNotificationBadge]);

  const loadTabRounds = useCallback(
    async (tab: MineTab, options?: { reset?: boolean }) => {
      const reset = options?.reset ?? false;
      const cursor =
        tab === "hosting" ? hostingCursor : tab === "joined" ? joinedCursor : invitedCursor;
      const hasMore =
        tab === "hosting" ? hostingHasMore : tab === "joined" ? joinedHasMore : invitedHasMore;
      const existingCount =
        tab === "hosting" ? hosting.length : tab === "joined" ? joined.length : invited.length;
      if (!reset && (!hasMore || loadingMore)) return;
      fetchSeqRef.current[tab] += 1;
      const seq = fetchSeqRef.current[tab];
      try {
        setError(null);
        if (reset && existingCount === 0) {
          setLoadingMore(false);
          setLoading(true);
        } else {
          setLoadingMore(true);
        }
        const authToken = await getTokenRef.current();
        const params = new URLSearchParams();
        params.set("tab", tab);
        params.set("limit", "20");
        if (!reset && cursor) params.set("cursor", cursor);
        const data = await apiGet<MineTabResponse>(`/api/rounds/mine?${params.toString()}`, authToken);
        if (tab === "hosting") {
          setHosting((prev) => (reset ? data.rounds : appendUniqueMineRounds(prev, data.rounds)));
          setHostingCursor(data.nextCursor);
          setHostingHasMore(data.hasMore);
          if (reset) tabLoadedRef.current.hosting = true;
        } else if (tab === "joined") {
          setJoined((prev) => (reset ? data.rounds : appendUniqueMineRounds(prev, data.rounds)));
          setJoinedCursor(data.nextCursor);
          setJoinedHasMore(data.hasMore);
          if (reset) tabLoadedRef.current.joined = true;
        } else {
          setInvited((prev) => {
            if (!reset) {
              return appendUniqueMineRounds(prev, data.rounds);
            }
            const responses = inviteResponseByRoundRef.current;
            const fresh = data.rounds;
            const freshIds = new Set(fresh.map((r) => r.id));
            const carried = prev.filter((r) => responses[r.id] && !freshIds.has(r.id));
            const merged = [...fresh, ...carried];
            merged.sort(sortMineByDate);
            return dedupeMineRoundsById(merged);
          });
          setInvitedCursor(data.nextCursor);
          setInvitedHasMore(data.hasMore);
          if (reset) tabLoadedRef.current.invited = true;
        }
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Unable to load rounds.");
        if (reset) {
          tabLoadedRef.current[tab] = true;
        }
      } finally {
        if (fetchSeqRef.current[tab] === seq) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [
      hostingCursor,
      joinedCursor,
      invitedCursor,
      hostingHasMore,
      joinedHasMore,
      invitedHasMore,
      loadingMore,
      hosting.length,
      joined.length,
      invited.length,
    ],
  );

  const loadTabRoundsRef = useRef(loadTabRounds);
  useEffect(() => {
    loadTabRoundsRef.current = loadTabRounds;
  }, [loadTabRounds]);

  useEffect(() => {
    void loadTabRoundsRef.current("hosting", { reset: true });
  }, []);

  useEffect(() => {
    const listLen =
      activeTab === "hosting"
        ? hosting.length
        : activeTab === "joined"
          ? joined.length
          : invited.length;
    const alreadyLoaded = tabLoadedRef.current[activeTab];
    if (!alreadyLoaded && listLen === 0 && !loading && !loadingMore) {
      void loadTabRoundsRef.current(activeTab, { reset: true });
    }
  }, [activeTab, hosting.length, joined.length, invited.length, loading, loadingMore]);

  function presentHostDeleteAlert(round: MineRound) {
    Alert.alert(
      "Delete round?",
      "This will permanently remove the round and all RSVP activity.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            setTimeout(() => void confirmDeleteHostedRound(round), 0);
          },
        },
      ],
    );
  }

  async function confirmDeleteHostedRound(round: MineRound) {
    setHostActionRoundId(round.id);
    setError(null);
    try {
      const authToken = await getTokenRef.current();
      await apiDelete<unknown>(`/api/rounds/${round.inviteToken}`, authToken);
      emitRoundListsShouldRefresh();
      setHosting((prev) => prev.filter((r) => r.id !== round.id));
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Could not delete round.",
      );
    } finally {
      setHostActionRoundId(null);
    }
  }

  async function submitInviteAction(round: MineRound, action: "claim" | "decline") {
    setInviteActionRoundId(round.id);
    setInviteRowError((prev) => {
      const next = { ...prev };
      delete next[round.id];
      return next;
    });
    try {
      const authToken = await getTokenRef.current();
      const json = await apiPost<{
        ok: boolean;
        status: InviteSpotResponse;
        me?: { id: string; name: string; avatar: string | null };
      }>(`/api/rounds/${round.inviteToken}/join`, { action }, authToken);

      setInviteResponseByRound((prev) => {
        const next = { ...prev };
        delete next[round.id];
        return next;
      });
      setInvited((prev) => prev.filter((r) => r.id !== round.id));

      if (json.me) {
        if (json.status === "confirmed" || json.status === "requested") {
          const nextPlayers =
            json.status === "confirmed"
              ? withMeInConfirmed(round.confirmedPlayers, json.me)
              : (round.confirmedPlayers ?? []);
          const nextRow: MineRound = {
            ...round,
            spotStatus: json.status,
            confirmedPlayers: nextPlayers,
            confirmedCount: nextPlayers.length,
          };
          setJoined((prev) => upsertJoinedRoundSorted(prev, nextRow));
        }
      }

      emitRoundListsShouldRefresh();
      void refreshNotificationBadge();
    } catch (actionError) {
      setInviteRowError((prev) => ({
        ...prev,
        [round.id]:
          actionError instanceof Error ? actionError.message : "Could not update your invite.",
      }));
    } finally {
      setInviteActionRoundId(null);
    }
  }

  function inviteResponseLabel(status: InviteSpotResponse) {
    if (status === "confirmed") return "You claimed a spot.";
    if (status === "requested") return "Request sent — waiting on host approval.";
    return "You declined this invite.";
  }

  const activeRounds =
    activeTab === "hosting" ? hosting : activeTab === "joined" ? joined : invited;
  /** Avoid empty-state flash when switching tabs before global `loading` flips true. */
  const tabHasLoadedOnce = tabLoadedRef.current[activeTab];
  const showEmptyListLoader =
    activeRounds.length === 0 && (loading || refreshing || !tabHasLoadedOnce);
  const emptyTitle =
    activeTab === "hosting"
      ? "No hosted rounds yet"
      : activeTab === "joined"
        ? "No joined rounds yet"
        : "No invites right now";
  const emptyMessage =
    activeTab === "hosting"
      ? "Create your first round and invite friends to get a game going."
      : activeTab === "joined"
        ? "Claim a spot from Discover and your joined rounds will show up here."
        : "When someone invites you to a round, it will appear here until you accept or decline.";
  const listHeader = (
    <>
      <Text style={styles.heading}>My rounds</Text>
      <Text style={styles.subheading}>Hosting, invites, and rounds you&apos;ve joined.</Text>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <View style={styles.tabsRow}>
        <Pressable
          style={styles.tabLink}
          onLayout={(event) => {
            const { x, width } = event.nativeEvent.layout;
            setTabMetrics((prev) => ({ ...prev, hosting: { x, width } }));
          }}
          onPress={() => setActiveTab("hosting")}
        >
          <Text style={[styles.tabText, activeTab === "hosting" && styles.tabTextActive]}>
            Hosting
          </Text>
        </Pressable>
        <Pressable
          style={styles.tabLink}
          onLayout={(event) => {
            const { x, width } = event.nativeEvent.layout;
            setTabMetrics((prev) => ({ ...prev, joined: { x, width } }));
          }}
          onPress={() => setActiveTab("joined")}
        >
          <Text style={[styles.tabText, activeTab === "joined" && styles.tabTextActive]}>
            Joined
          </Text>
        </Pressable>
        <Pressable
          style={styles.tabLink}
          onLayout={(event) => {
            const { x, width } = event.nativeEvent.layout;
            setTabMetrics((prev) => ({ ...prev, invited: { x, width } }));
          }}
          onPress={() => setActiveTab("invited")}
        >
          <Text style={[styles.tabText, activeTab === "invited" && styles.tabTextActive]}>
            Invited
          </Text>
        </Pressable>
        <Animated.View
          style={[
            styles.tabUnderline,
            {
              transform: [{ translateX: underlineX }],
              width: underlineW,
            },
          ]}
        />
      </View>
    </>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        style={styles.container}
        contentContainerStyle={styles.content}
        scrollEnabled={!listScrollLockedForRowSwipe}
        directionalLockEnabled={Platform.OS === "ios"}
        nestedScrollEnabled
        data={activeRounds}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          showEmptyListLoader ? (
            <View style={styles.inlineLoadingWrap}>
              <ActivityIndicator color={colors.fairway} />
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconWrap}>
                <Ionicons
                  name={
                    activeTab === "hosting"
                      ? "flag-outline"
                      : activeTab === "joined"
                        ? "people-outline"
                        : "mail-outline"
                  }
                  size={18}
                  color={colors.fairway}
                />
              </View>
              <Text style={styles.emptyTitle}>{emptyTitle}</Text>
              <Text style={styles.emptyText}>{emptyMessage}</Text>
              <Pressable
                style={styles.emptyCta}
                onPress={() =>
                  router.push(
                    activeTab === "hosting"
                      ? {
                          pathname: "/(tabs)/create",
                          params: { mode: "scheduled", session: String(Date.now()) },
                        }
                      : "/(tabs)",
                  )
                }
              >
                <Text style={styles.emptyCtaText}>
                  {activeTab === "hosting" ? "Create a round" : "Browse Discover"}
                </Text>
              </Pressable>
            </View>
          )
        }
        ListFooterComponent={
          loadingMore && !loading && !refreshing && activeRounds.length > 0 ? (
            <ActivityIndicator color={colors.fairway} style={styles.loadingMore} />
          ) : null
        }
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews={false}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          if (activeTab === "hosting") {
            setHostingCursor(null);
            setHostingHasMore(true);
            tabLoadedRef.current.hosting = false;
          } else if (activeTab === "joined") {
            setJoinedCursor(null);
            setJoinedHasMore(true);
            tabLoadedRef.current.joined = false;
          } else {
            setInvitedCursor(null);
            setInvitedHasMore(true);
            tabLoadedRef.current.invited = false;
          }
          void loadTabRounds(activeTab, { reset: true });
        }}
        onEndReachedThreshold={0.35}
        onEndReached={() => {
          if (loading || refreshing || loadingMore) return;
          if (activeTab === "hosting" && !hostingHasMore) return;
          if (activeTab === "joined" && !joinedHasMore) return;
          if (activeTab === "invited" && !invitedHasMore) return;
          void loadTabRounds(activeTab, { reset: false });
        }}
        renderItem={({ item: round }) => {
          const inviteOutcome = inviteResponseByRound[round.id];
          const rowBusy = inviteActionRoundId === round.id;
          const swipeVariant: "host" | "invite" | "none" =
            activeTab === "hosting"
              ? "host"
              : activeTab === "invited" && !inviteOutcome
                ? "invite"
                : "none";
          const swipeEnabled =
            activeTab === "hosting"
              ? !hostActionRoundId
              : activeTab === "invited"
                ? !inviteOutcome && !inviteActionRoundId
                : false;
          const effectiveIso = round.teeTime ?? round.targetDate;
          const imageUrl = round.imageUrl ?? "/images/event-fallback.svg";
          const joinPolicy = round.joinPolicy ?? "instant";
          return (
            <SwipeableMineRoundRow
              variant={swipeVariant}
              enabled={swipeEnabled}
              onSwipeActiveChange={onRowSwipeActiveChange}
              onHostDelete={() => presentHostDeleteAlert(round)}
              onHostEdit={() => {
                const now = Date.now();
                if (now - lastHostEditNavAtRef.current < 900) return;
                lastHostEditNavAtRef.current = now;
                router.push({
                  pathname: "/round/[token]/edit",
                  params: { token: round.inviteToken },
                });
              }}
              onInviteClaim={() => void submitInviteAction(round, "claim")}
              onInviteDecline={() => void submitInviteAction(round, "decline")}
            >
              <RoundListCard
                roundId={round.id}
                delayPressIn={
                  swipeVariant !== "none" && swipeEnabled ? 200 : undefined
                }
                mode={round.mode === "scheduled" ? "scheduled" : "planning"}
                courseName={round.courseName}
                imageUrl={imageUrl}
                joinPolicy={joinPolicy}
                totalSpots={round.totalSpots ?? 0}
                confirmedPlayers={round.confirmedPlayers ?? []}
                onCardPressIn={() =>
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
                primaryMeta={
                  round.mode === "scheduled"
                    ? formatScheduledCardMeta(effectiveIso, round.teeTime)
                    : formatPlanningWindow(round.preferredTimeWindow)
                }
                planningLocation={round.planningLocation}
                planningHeaderDate={formatPlanningHeaderDate(effectiveIso)}
                preferredTimeWindow={round.preferredTimeWindow}
                onPlayerPress={(player) =>
                  router.push({
                    pathname: "/profile/[userId]",
                    params: {
                      userId: player.id,
                      userName: player.name,
                      userAvatar: player.avatar ?? "",
                    },
                  })
                }
                onPlayerPressIn={(player) =>
                  prefetchPublicProfile(player.id, () => getTokenRef.current())
                }
                trailingAfterSpots={
                  activeTab === "joined" && round.spotStatus === "requested" ? (
                    <Text style={styles.badgeMutedSub}>Pending</Text>
                  ) : undefined
                }
                footer={
                  activeTab === "invited" ? (
                    <View style={styles.inviteFooter}>
                      {inviteOutcome ? (
                        <Text
                          style={
                            inviteOutcome === "declined"
                              ? styles.inviteResponseTextMuted
                              : styles.inviteResponseText
                          }
                        >
                          {inviteResponseLabel(inviteOutcome)}
                        </Text>
                      ) : rowBusy ? (
                        <ActivityIndicator color={colors.fairway} style={styles.inviteRowSpinner} />
                      ) : (
                        <View style={styles.inviteButtonsRow}>
                          <Pressable
                            style={[styles.inviteActionBtn, styles.inviteClaimBtn]}
                            onPress={() => void submitInviteAction(round, "claim")}
                            accessibilityLabel="Claim spot on this round"
                          >
                            <Text style={styles.inviteClaimBtnText}>Claim spot</Text>
                          </Pressable>
                          <Pressable
                            style={[styles.inviteActionBtn, styles.inviteDeclineBtn]}
                            onPress={() => void submitInviteAction(round, "decline")}
                            accessibilityLabel="Decline this invite"
                          >
                            <Text style={styles.inviteDeclineBtnText}>Decline</Text>
                          </Pressable>
                        </View>
                      )}
                      {inviteRowError[round.id] ? (
                        <Text style={styles.inviteRowErrorText}>{inviteRowError[round.id]}</Text>
                      ) : null}
                    </View>
                  ) : undefined
                }
              />
            </SwipeableMineRoundRow>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 32, gap: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  heading: { fontSize: 28, fontWeight: "700", color: colors.text },
  subheading: { color: colors.muted, marginBottom: 14 },
  tabsRow: {
    flexDirection: "row",
    gap: 18,
    marginBottom: 8,
    alignSelf: "flex-start",
    position: "relative",
    paddingBottom: 8,
  },
  tabLink: {
    paddingVertical: 2,
  },
  tabText: { color: colors.muted, fontWeight: "700", fontSize: 15 },
  tabTextActive: { color: colors.text },
  tabUnderline: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: 2,
    borderRadius: 999,
    backgroundColor: colors.fairway,
  },
  emptyText: { color: colors.muted, marginBottom: 4 },
  emptyCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    alignItems: "flex-start",
    gap: 8,
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
  emptyCta: {
    marginTop: 4,
    backgroundColor: colors.fairway,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  emptyCtaText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  inlineLoadingWrap: {
    paddingTop: 44,
    paddingBottom: 20,
    alignItems: "center",
  },
  headerBellBtn: {
    position: "relative",
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  headerBellDot: {
    top: 3,
    right: 3,
  },
  badgeMutedSub: {
    backgroundColor: "#f1efea",
    color: colors.muted,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
    fontWeight: "600",
    fontSize: 12,
  },
  inviteFooter: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
  inviteRowSpinner: {
    alignSelf: "flex-start",
    paddingVertical: 8,
  },
  inviteButtonsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  inviteActionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    minWidth: 118,
    alignItems: "center",
    justifyContent: "center",
  },
  inviteClaimBtn: {
    backgroundColor: colors.fairway,
  },
  inviteClaimBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  inviteDeclineBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inviteDeclineBtnText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 14,
  },
  inviteResponseText: {
    color: colors.fairway,
    fontWeight: "700",
    fontSize: 14,
  },
  inviteResponseTextMuted: {
    color: colors.muted,
    fontWeight: "700",
    fontSize: 14,
  },
  inviteRowErrorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "600",
  },
  loadingMore: { marginVertical: 10 },
  errorText: {
    color: colors.danger,
    backgroundColor: "#fee4e2",
    padding: 10,
    borderRadius: 12,
    marginBottom: 8,
  },
});
