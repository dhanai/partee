import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useAbly } from "ably/react";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { HeaderProfileIcon } from "../../components/header-profile-icon";
import { NotificationMustardDot } from "../../components/notification-mustard-dot";
import { RoundListCard } from "../../components/round-list-card";
import { SwipeableMineRoundRow } from "../../components/swipeable-mine-round-row";
import { apiDelete, apiGet, apiPost } from "../../lib/api";
import { useSnackbar } from "../../lib/snackbar-context";
import { prefetchPublicProfile } from "../../lib/public-profile-cache";
import { buildRoundListHint, prefetchRoundOpen } from "../../lib/round-details-cache";
import {
  formatPlanningHeaderDate,
  formatPlanningWindow,
  formatScheduledCardMeta,
  getTimeWindows,
  resolveTournamentTitle,
} from "../../lib/round-card-meta";
import { useNotificationBadge } from "../../lib/notification-badge-context";
import {
  applyOptimisticToMineRound,
  emitRoundListsShouldRefresh,
  subscribeRoundListsRefresh,
} from "../../lib/round-lists-refresh";
import { useChatUnread } from "../../lib/chat-unread-context";
import { parfadeRoundDetailChannel } from "../../lib/parfade-ably-channels";
import { parseParfadeRealtimeMessage } from "../../lib/parfade-ably-messages";
import { colors } from "../../lib/theme";
import { MineRound } from "../../types/round";

type MineTab = "rounds" | "invites";
type ApiMineTab = "hosting" | "joined" | "invited";

type MineTabResponse = {
  tab: ApiMineTab;
  rounds: MineRound[];
  nextCursor: string | null;
  hasMore: boolean;
  pendingInvitesCount?: number;
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
  const { show: showSnackbar } = useSnackbar();
  const { hasAnyUnreadChat, reportConversations } = useChatUnread();
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
  const [pendingInvitesCount, setPendingInvitesCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MineTab>("rounds");
  const activeTabRef = useRef<MineTab>("rounds");
  const lastHandledRefreshRef = useRef<string | null>(null);
  const [tabMetrics, setTabMetrics] = useState<{
    rounds: { x: number; width: number } | null;
    invites: { x: number; width: number } | null;
  }>({
    rounds: null,
    invites: null,
  });
  const tabLoadedRef = useRef<{ rounds: boolean; invites: boolean }>({
    rounds: false,
    invites: false,
  });
  /** Ignore stale `finally` from overlapping fetches for the same tab (focus + subscription + tab effect). */
  const fetchSeqRef = useRef<Record<MineTab, number>>({
    rounds: 0,
    invites: 0,
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

  // Subscribe to round-detail channels for loaded rounds so cards update in real-time
  const ably = useAbly();
  const allRoundTokens = useMemo(() => {
    const set = new Set<string>();
    for (const r of hosting) set.add(r.inviteToken);
    for (const r of joined) set.add(r.inviteToken);
    for (const r of invited) set.add(r.inviteToken);
    return Array.from(set);
  }, [hosting, joined, invited]);

  useEffect(() => {
    if (allRoundTokens.length === 0) return;
    const subs: { channel: ReturnType<typeof ably.channels.get>; handler: (msg: import("ably").Message) => void }[] = [];
    for (const token of allRoundTokens) {
      const channel = ably.channels.get(parfadeRoundDetailChannel(token));
      const handler = (msg: import("ably").Message) => {
        const parsed = parseParfadeRealtimeMessage(msg.data);
        if (parsed?.type === "round-detail-updated") {
          void loadTabRoundsRef.current(activeTabRef.current, { reset: true, silent: true });
        }
      };
      void channel.subscribe("parfade", handler);
      subs.push({ channel, handler });
    }
    return () => {
      for (const { channel, handler } of subs) {
        void channel.unsubscribe("parfade", handler);
      }
    };
  }, [ably, allRoundTokens]);

  const roundsListFocusCountRef = useRef(0);
  useFocusEffect(
    useCallback(() => {
      roundsListFocusCountRef.current += 1;
      if (roundsListFocusCountRef.current > 1) {
        void loadTabRoundsRef.current(activeTabRef.current, { reset: true, silent: true });
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
        tabParam === "invited" || tabParam === "invites" ? "invites" : "rounds";
      setActiveTab(requestedTab);

      if (requestedTab === "rounds") {
        setHostingCursor(null);
        setHostingHasMore(true);
        setJoinedCursor(null);
        setJoinedHasMore(true);
        tabLoadedRef.current.rounds = false;
      } else {
        setInvitedCursor(null);
        setInvitedHasMore(true);
        tabLoadedRef.current.invites = false;
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
        <View style={styles.headerRightRow}>
          <Pressable
            style={styles.headerIconBtn}
            onPress={() => router.push("/chats")}
            accessibilityLabel={
              hasAnyUnreadChat ? "Open chats, has unread" : "Open chats"
            }
          >
            <Ionicons name="paper-plane-outline" size={17} color={colors.fairway} />
            {hasAnyUnreadChat ? (
              <NotificationMustardDot style={styles.headerIconDot} />
            ) : null}
          </Pressable>
          <Pressable
            style={styles.headerIconBtn}
            onPress={() => router.push("/notifications")}
            accessibilityLabel={
              showNotificationBadge ? "Open notifications, has unread" : "Open notifications"
            }
          >
            <Ionicons name="notifications-outline" size={18} color={colors.fairway} />
            {showNotificationBadge ? (
              <NotificationMustardDot style={styles.headerIconDot} />
            ) : null}
          </Pressable>
          <HeaderProfileIcon />
        </View>
      ),
    });
  }, [navigation, router, showNotificationBadge, hasAnyUnreadChat]);

  const loadTabRounds = useCallback(
    async (tab: MineTab, options?: { reset?: boolean; silent?: boolean }) => {
      const reset = options?.reset ?? false;
      const silent = options?.silent ?? false;
      const hasMore =
        tab === "rounds" ? hostingHasMore || joinedHasMore : invitedHasMore;
      const existingCount =
        tab === "rounds" ? hosting.length + joined.length : invited.length;
      if (!reset && (!hasMore || loadingMore)) return;
      fetchSeqRef.current[tab] += 1;
      const seq = fetchSeqRef.current[tab];
      try {
        setError(null);
        if (silent) {
          // no spinners
        } else if (reset && existingCount === 0) {
          setLoadingMore(false);
          setLoading(true);
        } else {
          setLoadingMore(true);
        }
        const authToken = await getTokenRef.current();
        if (tab === "rounds") {
          const requests: Array<Promise<{ apiTab: ApiMineTab; data: MineTabResponse }>> = [];
          if (reset || hostingHasMore) {
            const p = new URLSearchParams();
            p.set("tab", "hosting");
            p.set("limit", "20");
            if (!reset && hostingCursor) p.set("cursor", hostingCursor);
            requests.push(
              apiGet<MineTabResponse>(`/api/rounds/mine?${p.toString()}`, authToken).then((data) => ({
                apiTab: "hosting",
                data,
              })),
            );
          }
          if (reset || joinedHasMore) {
            const p = new URLSearchParams();
            p.set("tab", "joined");
            p.set("limit", "20");
            if (!reset && joinedCursor) p.set("cursor", joinedCursor);
            requests.push(
              apiGet<MineTabResponse>(`/api/rounds/mine?${p.toString()}`, authToken).then((data) => ({
                apiTab: "joined",
                data,
              })),
            );
          }

          const results = await Promise.all(requests);
          for (const { apiTab, data } of results) {
            if (apiTab === "hosting") {
              setHosting((prev) => (reset ? data.rounds : appendUniqueMineRounds(prev, data.rounds)));
              setHostingCursor(data.nextCursor);
              setHostingHasMore(data.hasMore);
            } else {
              setJoined((prev) => (reset ? data.rounds : appendUniqueMineRounds(prev, data.rounds)));
              setJoinedCursor(data.nextCursor);
              setJoinedHasMore(data.hasMore);
            }
          }
          if (reset) tabLoadedRef.current.rounds = true;
        } else {
          const params = new URLSearchParams();
          params.set("tab", "invited");
          params.set("limit", "20");
          if (!reset && invitedCursor) params.set("cursor", invitedCursor);
          const data = await apiGet<MineTabResponse>(`/api/rounds/mine?${params.toString()}`, authToken);
          setPendingInvitesCount(Math.max(0, data.pendingInvitesCount ?? 0));
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
          if (reset) tabLoadedRef.current.invites = true;
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
    void loadTabRoundsRef.current("rounds", { reset: true });
    void loadTabRoundsRef.current("invites", { reset: true, silent: true });
  }, []);

  useEffect(() => {
    const allRounds = [...hosting, ...joined, ...invited];
    const convos = allRounds
      .filter((r) => r.conversationId)
      .map((r) => ({ id: r.conversationId!, isUnread: !!r.isChatUnread }));
    reportConversations(convos);
  }, [hosting, joined, invited, reportConversations]);

  useEffect(() => {
    const listLen =
      activeTab === "rounds" ? hosting.length + joined.length : invited.length;
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
      showSnackbar("Round deleted");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Could not delete round.",
      );
    } finally {
      setHostActionRoundId(null);
    }
  }

  async function cancelJoinRequestFromInvites(round: MineRound) {
    setInviteActionRoundId(round.id);
    setInviteRowError((prev) => {
      const next = { ...prev };
      delete next[round.id];
      return next;
    });
    try {
      const authToken = await getTokenRef.current();
      await apiPost(`/api/rounds/${round.inviteToken}/join`, { action: "cancel_request" }, authToken);
      setPendingInvitesCount((prev) =>
        Math.max(
          0,
          prev - (round.spotStatus === "invited" || round.spotStatus === "requested" ? 1 : 0),
        ),
      );
      setInvited((prev) => prev.filter((r) => r.id !== round.id));
      emitRoundListsShouldRefresh();
      void refreshNotificationBadge();
    } catch (cancelError) {
      setInviteRowError((prev) => ({
        ...prev,
        [round.id]:
          cancelError instanceof Error ? cancelError.message : "Could not cancel request.",
      }));
    } finally {
      setInviteActionRoundId(null);
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

      if (json.status === "declined") {
        setPendingInvitesCount((prev) => Math.max(0, prev - (round.spotStatus === "invited" ? 1 : 0)));
        setInvited((prev) =>
          prev.map((r) => (r.id === round.id ? { ...r, spotStatus: "declined" } : r)),
        );
      } else {
        setPendingInvitesCount((prev) => Math.max(0, prev - (round.spotStatus === "invited" ? 1 : 0)));
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

  const mergedRounds = useMemo(
    () => dedupeMineRoundsById([...hosting, ...joined]).sort(sortMineByDate),
    [hosting, joined],
  );
  const hostedRoundIds = useMemo(() => new Set(hosting.map((r) => r.id)), [hosting]);
  const activeRounds = activeTab === "rounds" ? mergedRounds : invited;
  /** Avoid empty-state flash when switching tabs before global `loading` flips true. */
  const tabHasLoadedOnce = tabLoadedRef.current[activeTab];
  const showEmptyListLoader =
    activeRounds.length === 0 && (loading || refreshing || !tabHasLoadedOnce);
  const emptyTitle = activeTab === "rounds" ? "No rounds yet" : "No invites right now";
  const emptyMessage =
    activeTab === "rounds"
      ? "Rounds you host and rounds you've joined show up here."
      : "Invites, join requests you’ve sent, and declined rounds you can reopen all show here.";
  const listHeader = (
    <>
      <Text style={styles.heading}>My rounds</Text>
      <Text style={styles.subheading}>Your hosted rounds, joined rounds, and invites.</Text>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <View style={styles.tabsRow}>
        <Pressable
          style={styles.tabLink}
          onLayout={(event) => {
            const { x, width } = event.nativeEvent.layout;
            setTabMetrics((prev) => ({ ...prev, rounds: { x, width } }));
          }}
          onPress={() => setActiveTab("rounds")}
        >
          <Text style={[styles.tabText, activeTab === "rounds" && styles.tabTextActive]}>
            Rounds
          </Text>
        </Pressable>
        <Pressable
          style={styles.tabLink}
          onLayout={(event) => {
            const { x, width } = event.nativeEvent.layout;
            setTabMetrics((prev) => ({ ...prev, invites: { x, width } }));
          }}
          onPress={() => setActiveTab("invites")}
        >
          <View style={styles.tabWithCount}>
            <Text style={[styles.tabText, activeTab === "invites" && styles.tabTextActive]}>
              Invites
            </Text>
            {pendingInvitesCount > 0 ? (
              <View style={styles.invitesCountBubble}>
                <Text style={styles.invitesCountBubbleText}>
                  {pendingInvitesCount > 99 ? "99+" : String(pendingInvitesCount)}
                </Text>
              </View>
            ) : null}
          </View>
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
                    activeTab === "rounds"
                      ? "flag-outline"
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
                    activeTab === "rounds"
                      ? {
                          pathname: "/(tabs)/create",
                          params: { mode: "scheduled", session: String(Date.now()) },
                        }
                      : "/(tabs)",
                  )
                }
              >
                <Text style={styles.emptyCtaText}>
                  {activeTab === "rounds" ? "Create a round" : "Browse Discover"}
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
          if (activeTab === "rounds") {
            setHostingCursor(null);
            setHostingHasMore(true);
            setJoinedCursor(null);
            setJoinedHasMore(true);
            tabLoadedRef.current.rounds = false;
          } else {
            setInvitedCursor(null);
            setInvitedHasMore(true);
            tabLoadedRef.current.invites = false;
          }
          void loadTabRounds(activeTab, { reset: true });
        }}
        onEndReachedThreshold={0.35}
        onEndReached={() => {
          if (loading || refreshing || loadingMore) return;
          if (activeTab === "rounds" && !hostingHasMore && !joinedHasMore) return;
          if (activeTab === "invites" && !invitedHasMore) return;
          void loadTabRounds(activeTab, { reset: false });
        }}
        renderItem={({ item: round }) => {
          const optimisticInviteOutcome = inviteResponseByRound[round.id];
          const effectiveInviteOutcome =
            optimisticInviteOutcome ??
            (round.spotStatus === "declined" ? "declined" : undefined);
          const rowBusy = inviteActionRoundId === round.id;
          const isHostedRow = hostedRoundIds.has(round.id);
          const swipeVariant: "host" | "invite" | "none" =
            activeTab === "rounds" && isHostedRow
              ? "host"
              : activeTab === "invites" && !effectiveInviteOutcome
                ? "invite"
                : "none";
          const swipeEnabled =
            activeTab === "rounds" && isHostedRow
              ? !hostActionRoundId
              : activeTab === "invites"
                ? !effectiveInviteOutcome && !inviteActionRoundId
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
                mode={
                  round.mode === "planning"
                    ? "planning"
                    : round.mode === "tournament"
                      ? "tournament"
                      : "scheduled"
                }
                courseName={round.courseName}
                tournamentTitle={resolveTournamentTitle(round)}
                inviteToken={round.inviteToken}
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
                  round.mode === "scheduled" || round.mode === "tournament"
                    ? formatScheduledCardMeta(effectiveIso, round.teeTime)
                    : formatPlanningWindow(getTimeWindows(round))
                }
                planningLocation={round.planningLocation}
                planningHeaderDate={formatPlanningHeaderDate(effectiveIso)}
                preferredTimeWindow={getTimeWindows(round)}
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
                footer={
                  activeTab === "invites" ? (
                    <View style={styles.inviteFooter}>
                      {round.spotStatus === "requested" ? (
                        rowBusy ? (
                          <ActivityIndicator color={colors.fairway} style={styles.inviteRowSpinner} />
                        ) : (
                          <>
                            <Text style={styles.inviteResponseText}>
                              Waiting for host approval.
                            </Text>
                            <Pressable
                              style={[styles.inviteActionBtn, styles.inviteDeclineBtn, styles.inviteCancelRequestBtn]}
                              onPress={() => void cancelJoinRequestFromInvites(round)}
                              accessibilityLabel="Cancel join request"
                            >
                              <Text style={styles.inviteDeclineBtnText}>Cancel request</Text>
                            </Pressable>
                          </>
                        )
                      ) : effectiveInviteOutcome ? (
                        <Text
                          style={
                            effectiveInviteOutcome === "declined"
                              ? styles.inviteResponseTextMuted
                              : styles.inviteResponseText
                          }
                        >
                          {inviteResponseLabel(effectiveInviteOutcome)}
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
  tabWithCount: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tabText: { color: colors.muted, fontWeight: "700", fontSize: 15 },
  tabTextActive: { color: colors.text },
  invitesCountBubble: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 999,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  invitesCountBubbleText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 11,
  },
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
  headerRightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerIconBtn: {
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
  headerIconDot: {
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
  inviteCancelRequestBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
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
