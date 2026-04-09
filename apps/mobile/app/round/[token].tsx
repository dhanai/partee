import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import {
  Alert,
  Share,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useAblyChatMounted } from "../../lib/ably-chat-context";
import { ParfadeRoundDetailLiveRefresh } from "../../components/parfade-round-detail-live-refresh";
import { RoundCoverImage } from "../../components/round-cover-image";
import { apiDelete, apiPost, publicWebOrigin, toAbsoluteUrl } from "../../lib/api";
import { ROUND_INVITE_USER_IDS_MAX_PER_REQUEST } from "../../lib/round-invite-limits";
import { hapticSuccess, hapticWarning, hapticLight } from "../../lib/haptics";
import { getCachedMeProfile } from "../../lib/me-profile-cache";
import type { InviteSelectionUser } from "../../lib/invite-selection-store";
import { InviteFriendsSheet } from "../../components/invite-friends-sheet";
import { prefetchPublicProfile } from "../../lib/public-profile-cache";
import {
  computeBootstrapRound,
  fetchRoundDetailsAndCache,
  setCachedRoundDetails,
} from "../../lib/round-details-cache";
import {
  applyOptimisticToRoundDetails,
  emitRoundListsShouldRefresh,
  subscribeRoundListsRefresh,
} from "../../lib/round-lists-refresh";
import { presentAddRoundToCalendar } from "../../lib/present-add-round-to-calendar";
import { claimRsvpButtonStyles as btn } from "../../lib/claim-rsvp-button-styles";
import { formatInviterFirstLastInitial } from "../../lib/format-inviter-first-last-initial";
import { TournamentMarkdownBody } from "../../lib/tournament-markdown";
import { useSnackbar } from "../../lib/snackbar-context";
import { useNotificationBadge } from "../../lib/notification-badge-context";
import { useCourseSearchBiasCoords } from "../../lib/use-course-search-bias-coords";
import { colors } from "../../lib/theme";
import { InitialAvatar } from "../../components/initial-avatar";
import { RoundDetails } from "../../types/round";

function groupChatPreviewSubtitle(last: RoundDetails["lastChatMessage"]): string {
  if (!last) return "No messages yet. Say hi!";
  const snippet = last.body.replace(/\s+/g, " ").trim();
  const max = 160;
  const cut = snippet.length > max ? `${snippet.slice(0, max)}…` : snippet;
  return `${formatInviterFirstLastInitial(last.senderName)}: ${cut}`;
}
import {
  AnimatedBottomSheetFrame,
  BottomSheetScrollView,
} from "../../components/animated-bottom-sheet-frame";
import {
  ConfirmedSpotsRow,
  HostInvitedSpotsScrollRow,
  type ConfirmedSpotPlayer,
} from "../../components/confirmed-spots-row";
import { OverflowMenuSheet } from "../../components/overflow-menu-sheet";
import { ReportSheet } from "../../components/report-sheet";
import { RoundCourseLocationSheet } from "../../components/round-course-location-sheet";
import { RoundDetailSection } from "../../components/round-detail-section";
import { PlanningRoundBadge } from "../../components/planning-round-badge";
import {
  formatFriendlyTeeDateTime,
  getTimeWindows,
  resolveTournamentTitle,
} from "../../lib/round-card-meta";
import { DatePickerModal } from "../../components/date-picker-modal";
import { TimePickerModal } from "../../components/time-picker-modal";
import { getGameDefinitions, useGameTypesVersion } from "../../lib/games-registry";
import { refreshGameTypes } from "../../lib/game-types-cache";

/** Caps sheet height so it does not extend under the status bar; list scrolls inside. */
const SIDE_GAMES_SHEET_SNAP_POINTS = ["78%"] as const;

type CourseResult = { id: string; name: string; address: string };

function coerceRoundHintParam(
  raw: string | string[] | undefined,
): string | undefined {
  if (raw == null) return undefined;
  return Array.isArray(raw) ? raw[0] : raw;
}
function useDebounce(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function formatPlanningWindow(
  window: unknown[] | string | null | undefined,
) {
  if (!window) return "Anytime";
  const arr = Array.isArray(window) ? window.filter((s): s is string => typeof s === "string") : [window];
  if (arr.length === 0 || arr.length >= 3) return "Anytime";
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (arr.length === 1) return cap(arr[0]);
  return arr.map(cap).join(" or ");
}

export default function RoundDetailsScreen() {
  const { token, roundHint, hostJoinRequests: rawHostJoinRequests } = useLocalSearchParams<{
    token: string;
    roundHint?: string | string[];
    hostJoinRequests?: string | string[];
  }>();
  const router = useRouter();
  const navigation = useNavigation();
  const headerHeight = useHeaderHeight();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const ablyChatMounted = useAblyChatMounted();
  const { show: showSnackbar } = useSnackbar();
  const { refresh: refreshNotificationBadge } = useNotificationBadge();
  const scrollRef = useRef<ScrollView>(null);
  const hostJoinRequestsSectionYRef = useRef(0);
  const hostJoinScrollDoneRef = useRef(false);
  const [hostJoinBusyUserId, setHostJoinBusyUserId] = useState<string | null>(null);
  const [hostJoinSectionExpanded, setHostJoinSectionExpanded] = useState(true);
  const [round, setRound] = useState<RoundDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiResolved, setApiResolved] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const isFirstFocusRef = useRef(true);
  const [busy, setBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const gameTypesVersion = useGameTypesVersion();
  const sideGameDefs = useMemo(
    () => getGameDefinitions().filter((g) => g.implemented),
    [gameTypesVersion],
  );

  useEffect(() => {
    void refreshGameTypes();
  }, []);

  const [finalizeQuery, setFinalizeQuery] = useState("");
  const [finalizeResults, setFinalizeResults] = useState<CourseResult[]>([]);
  const [finalizeCourse, setFinalizeCourse] = useState<CourseResult | null>(null);
  const [showFinalizeResults, setShowFinalizeResults] = useState(false);
  const [loadingFinalizeCourses, setLoadingFinalizeCourses] = useState(false);
  const [finalizeTeeDate, setFinalizeTeeDate] = useState<Date | null>(null);
  const [finalizeTeeTimeValue, setFinalizeTeeTimeValue] = useState<Date>(() => {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    return now;
  });
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [roundMenuOpen, setRoundMenuOpen] = useState(false);
  const [reportRoundOpen, setReportRoundOpen] = useState(false);
  const [finalizeBusy, setFinalizeBusy] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const debouncedFinalizeQuery = useDebounce(finalizeQuery, 320);
  const courseBiasCoords = useCourseSearchBiasCoords();
  const [inviteBusy, setInviteBusy] = useState(false);
  const [finalizeExpanded, setFinalizeExpanded] = useState(true);
  const [inviteSheetOpen, setInviteSheetOpen] = useState(false);
  const [sideGamesSheetOpen, setSideGamesSheetOpen] = useState(false);
  const [courseLocationSheetOpen, setCourseLocationSheetOpen] = useState(false);
  /** Host: long-press avatar on Invited / Claimed for Remove / View profile. */
  const [hostSpotMenuPlayer, setHostSpotMenuPlayer] = useState<ConfirmedSpotPlayer | null>(null);
  const inviteFriendExcludeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of round?.confirmedPlayers ?? []) ids.add(p.id);
    for (const p of round?.invitedPlayers ?? []) ids.add(p.id);
    for (const r of round?.pendingJoinRequests ?? []) ids.add(r.userId);
    return ids;
  }, [round]);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const openHostJoinRequests = useMemo(() => {
    const v = rawHostJoinRequests;
    if (v === "1") return true;
    if (Array.isArray(v) && v[0] === "1") return true;
    return false;
  }, [rawHostJoinRequests]);

  useEffect(() => {
    hostJoinScrollDoneRef.current = false;
  }, [token]);

  useEffect(() => {
    if (!openHostJoinRequests || !apiResolved || hostJoinScrollDoneRef.current) return;
    const pending = round?.pendingJoinRequests?.length ?? 0;
    if (pending === 0) return;
    const timer = setTimeout(() => {
      const y = hostJoinRequestsSectionYRef.current;
      if (y > 0) {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
      }
      hostJoinScrollDoneRef.current = true;
    }, 420);
    return () => clearTimeout(timer);
  }, [openHostJoinRequests, apiResolved, round?.pendingJoinRequests?.length, round?.id]);

  useEffect(() => {
    return subscribeRoundListsRefresh((payload) => {
      if (!payload.optimistic || payload.optimistic.inviteToken !== token) return;
      const p = payload.optimistic;
      setRound((prev) => {
        if (!prev) return prev;
        return applyOptimisticToRoundDetails(prev, p);
      });
    });
  }, [token]);

  const loadRound = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!token) return;
      const silent = options?.silent ?? false;
      if (!silent) {
        setLoading(true);
      }
      try {
        setError(null);
        const authToken = await getTokenRef.current();
        const data = await fetchRoundDetailsAndCache(token, authToken);
        setRound(data);
        setApiResolved(true);
        if (data.mode === "planning") {
          const target = new Date(data.targetDate);
          target.setHours(0, 0, 0, 0);
          setFinalizeTeeDate(target);
        }
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Unable to load.");
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  const onRemoteRoundDetailRefresh = useCallback(() => {
    void loadRound({ silent: true });
  }, [loadRound]);

  const roundDetailLive =
    ablyChatMounted && token ? (
      <ParfadeRoundDetailLiveRefresh
        inviteToken={token}
        onRoundMaybeUpdated={onRemoteRoundDetailRefresh}
      />
    ) : null;

  useLayoutEffect(() => {
    if (!token) {
      setRound(null);
      setLoading(true);
      return;
    }
    isFirstFocusRef.current = true;
    setApiResolved(false);
    const hintRaw = coerceRoundHintParam(roundHint);
    const next = computeBootstrapRound(token, hintRaw);
    setRound(next);
    setLoading(!next);
    if (next?.mode === "planning") {
      const target = new Date(next.targetDate);
      target.setHours(0, 0, 0, 0);
      setFinalizeTeeDate(target);
    }
    void loadRound({ silent: Boolean(next) });
  }, [token, roundHint, loadRound]);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      if (isFirstFocusRef.current) {
        isFirstFocusRef.current = false;
        return;
      }
      void loadRound({ silent: true });
    }, [token, loadRound]),
  );

  /** Only cache after GET succeeds — bootstrap/hint rows omit courseAddress/coords and would poison the 3‑min cache. */
  useEffect(() => {
    if (round && apiResolved) {
      setCachedRoundDetails(round);
    }
  }, [round, apiResolved]);

  useLayoutEffect(() => {
    if (loading || !round || !apiResolved) {
      navigation.setOptions({
        headerRight: undefined,
        headerRightContainerStyle: undefined,
      });
      return;
    }
    const showOverflowMenu =
      round.isHost || round.currentUserSpotStatus === "confirmed";
    if (!showOverflowMenu) {
      navigation.setOptions({
        headerRight: undefined,
        headerRightContainerStyle: undefined,
      });
      return;
    }
    navigation.setOptions({
      headerRightContainerStyle: { paddingRight: 10 },
      headerRight: () => (
        <Pressable
          accessibilityLabel="Round actions"
          accessibilityRole="button"
          hitSlop={12}
          onPress={() => setRoundMenuOpen(true)}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
        </Pressable>
      ),
    });
  }, [navigation, loading, round, apiResolved]);

  useEffect(() => {
    let active = true;
    async function runFinalizeCourseSearch() {
      const q = debouncedFinalizeQuery.trim();
      if (q.length < 2) {
        if (active) {
          setFinalizeResults([]);
          setShowFinalizeResults(false);
        }
        return;
      }
      if (finalizeCourse && q === finalizeCourse.name) {
        if (active) {
          setShowFinalizeResults(false);
          setLoadingFinalizeCourses(false);
        }
        return;
      }
      setLoadingFinalizeCourses(true);
      try {
        const authToken = await getTokenRef.current();
        const data = await apiPost<{ courses: CourseResult[] }>(
          "/api/courses/search",
          {
            query: q,
            ...(courseBiasCoords
              ? {
                  latitude: courseBiasCoords.latitude,
                  longitude: courseBiasCoords.longitude,
                }
              : {}),
          },
          authToken,
        );
        if (!active) return;
        setFinalizeResults(data.courses);
        setShowFinalizeResults(true);
      } catch (searchError) {
        if (!active) return;
        setFinalizeError(
          searchError instanceof Error ? searchError.message : "Course search failed.",
        );
      } finally {
        if (active) setLoadingFinalizeCourses(false);
      }
    }
    void runFinalizeCourseSearch();
    return () => {
      active = false;
    };
  }, [debouncedFinalizeQuery, finalizeCourse, courseBiasCoords]);


  function startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function formatDateLabel(date: Date | null) {
    if (!date) return "Select date";
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  function formatTimeLabel(date: Date) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function openCalendar() {
    Keyboard.dismiss();
    setCalendarOpen(true);
  }

  function onSelectCalendarDay(day: Date) {
    setFinalizeTeeDate(startOfDay(day));
    setCalendarOpen(false);
  }

  async function finalizeRound() {
    if (!token) return;
    if (!finalizeCourse) {
      setFinalizeError("Select a course.");
      return;
    }
    if (!finalizeTeeDate) {
      setFinalizeError("Select tee date.");
      return;
    }
    setFinalizeBusy(true);
    setFinalizeError(null);
    try {
      const authToken = await getToken();
      await apiPost(
        `/api/rounds/${token}/finalize`,
        {
          courseId: finalizeCourse.id,
          teeTime: (() => {
            const combined = new Date(finalizeTeeDate);
            combined.setHours(
              finalizeTeeTimeValue.getHours(),
              finalizeTeeTimeValue.getMinutes(),
              0,
              0,
            );
            return combined.toISOString();
          })(),
        },
        authToken,
      );
      const refreshed = await fetchRoundDetailsAndCache(token, authToken);
      setRound(refreshed);
      showSnackbar("Round finalized");
    } catch (finalizeSubmitError) {
      setFinalizeError(
        finalizeSubmitError instanceof Error
          ? finalizeSubmitError.message
          : "Unable to finalize.",
      );
    } finally {
      setFinalizeBusy(false);
    }
  }

  async function cancelJoinRequest() {
    if (!token || !round || round.currentUserSpotStatus !== "requested") return;
    const prevRound = round;
    setBusy(true);
    setError(null);
    setRound({ ...round, currentUserSpotStatus: null });
    try {
      const authToken = await getToken();
      await apiPost<{ ok?: boolean; status?: string | null }>(
        `/api/rounds/${token}/join`,
        { action: "cancel_request" },
        authToken,
      );
      hapticSuccess();
      showSnackbar("Join request canceled");
      emitRoundListsShouldRefresh();
      void loadRound({ silent: true });
    } catch (cancelError) {
      setRound(prevRound);
      setError(
        cancelError instanceof Error ? cancelError.message : "Unable to cancel request.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function hostResolveGuestJoinRequest(guestUserId: string, action: "accept" | "decline") {
    if (!token || !round?.isHost) return;
    setHostJoinBusyUserId(guestUserId);
    setError(null);
    try {
      const authToken = await getTokenRef.current();
      await apiPost(`/api/rounds/${token}/join-requests`, { guestUserId, action }, authToken);
      hapticSuccess();
      showSnackbar(action === "accept" ? "Player confirmed for this round." : "Join request declined.");
      emitRoundListsShouldRefresh();
      void refreshNotificationBadge();
      const next = await fetchRoundDetailsAndCache(token, authToken);
      setRound(next);
    } catch (resolveError) {
      setError(
        resolveError instanceof Error ? resolveError.message : "Could not update join request.",
      );
    } finally {
      setHostJoinBusyUserId(null);
    }
  }

  async function rsvp(action: "claim" | "decline") {
    if (!token || !round) return;
    const prevRound = round;
    const wasConfirmed = round.currentUserSpotStatus === "confirmed";
    setBusy(true);
    setError(null);
    

    const me = getCachedMeProfile();
    const mePlayer = me ? { id: me.id, name: me.name, avatar: me.avatar } : null;

    if (action === "claim" && mePlayer && round.joinPolicy === "instant") {
      const alreadyIn = round.confirmedPlayers.some((p) => p.id === mePlayer.id);
      setRound({
        ...round,
        currentUserSpotStatus: "confirmed",
        confirmedPlayers: alreadyIn ? round.confirmedPlayers : [...round.confirmedPlayers, mePlayer],
        confirmedCount: alreadyIn ? round.confirmedCount : round.confirmedCount + 1,
        spotsRemaining: alreadyIn ? round.spotsRemaining : Math.max(0, round.spotsRemaining - 1),
      });
    } else if (action === "decline") {
      setRound({
        ...round,
        currentUserSpotStatus: "declined",
        confirmedPlayers: mePlayer
          ? round.confirmedPlayers.filter((p) => p.id !== mePlayer.id)
          : round.confirmedPlayers,
        confirmedCount: wasConfirmed ? Math.max(0, round.confirmedCount - 1) : round.confirmedCount,
        spotsRemaining: wasConfirmed ? round.spotsRemaining + 1 : round.spotsRemaining,
        declinedPlayers: mePlayer && !round.declinedPlayers.some((p) => p.id === mePlayer.id)
          ? [...round.declinedPlayers, mePlayer]
          : round.declinedPlayers,
      });
    }

    try {
      const authToken = await getToken();
      const result = await apiPost<{ status?: "confirmed" | "requested" | "declined" }>(
        `/api/rounds/${token}/join`,
        { action },
        authToken,
      );

      hapticSuccess();
      if (result.status === "requested") {
        setRound({ ...prevRound, currentUserSpotStatus: "requested" });
        showSnackbar("Join request submitted");
      } else if (result.status === "declined" || action === "decline") {
        showSnackbar(wasConfirmed ? "Spot released" : "Declined");
      } else {
        showSnackbar("Spot claimed");
      }
    } catch (submitError) {
      setRound(prevRound);
      setError(submitError instanceof Error ? submitError.message : "Unable to RSVP.");
    } finally {
      setBusy(false);
    }
  }

  function confirmDeleteRound() {
    if (!round?.isHost || deleteBusy) return;
    Alert.alert(
      "Delete round?",
      "This will permanently remove the round and all RSVP activity.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            setTimeout(() => void deleteRound(), 0);
          },
        },
      ],
    );
  }

  async function deleteRound() {
    if (!token || !round?.isHost || deleteBusy) return;
    setDeleteBusy(true);
    setError(null);
    
    try {
      const authToken = await getToken();
      await apiDelete<{ ok: boolean }>(`/api/rounds/${token}`, authToken);
      emitRoundListsShouldRefresh();
      showSnackbar("Round deleted");
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/(tabs)");
      }
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Unable to delete round.",
      );
    } finally {
      setDeleteBusy(false);
    }
  }

  async function shareInviteLink() {
    if (!round) return;
    const inviteUrl = `${publicWebOrigin}/round/${round.inviteToken}`;
    const where =
      round.mode === "planning"
        ? (round.planningLocation?.trim() ||
            round.courseName?.trim() ||
            "a round I'm planning")
        : round.mode === "tournament"
          ? (resolveTournamentTitle(round) || round.courseName?.trim() || "this round")
          : (round.courseName?.trim() || "this round");
    try {
      // Single URL in the message only — iOS duplicates the link when `url` is also set.
      await Share.share({
        message: `Join my round at ${where} on Parfade: ${inviteUrl}`,
      });
    } catch {
      setError("Unable to open share sheet.");
    }
  }

  async function sendInvites(users: InviteSelectionUser[]) {
    if (!token || users.length === 0) return;
    setInviteBusy(true);
    setError(null);

    try {
      const authToken = await getTokenRef.current();
      const ids = users.map((u) => u.id);
      let totalInvited = 0;
      const max = ROUND_INVITE_USER_IDS_MAX_PER_REQUEST;
      for (let offset = 0; offset < ids.length; offset += max) {
        const chunk = ids.slice(offset, offset + max);
        const response = await apiPost<{ invitedCount: number; skippedCount: number }>(
          `/api/rounds/${token}/invites`,
          { inviteeUserIds: chunk },
          authToken,
        );
        totalInvited += response.invitedCount;
      }
      if (totalInvited > 0) {
        const refreshed = await fetchRoundDetailsAndCache(token, authToken);
        setRound(refreshed);
      }
      showSnackbar(
        totalInvited > 0
          ? `Invite blast sent to ${totalInvited} golfer${totalInvited === 1 ? "" : "s"}`
          : "No new invites sent",
      );
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "Unable to send invites.");
    } finally {
      setInviteBusy(false);
    }
  }

  async function removeGuestFromRound(player: ConfirmedSpotPlayer) {
    if (!token) return;
    setError(null);
    try {
      const authToken = await getTokenRef.current();
      await apiPost(`/api/rounds/${token}/remove-guest`, { targetUserId: player.id }, authToken);
      hapticSuccess();
      emitRoundListsShouldRefresh();
      void refreshNotificationBadge();
      const refreshed = await fetchRoundDetailsAndCache(token, authToken);
      setRound(refreshed);
      showSnackbar("Player removed");
    } catch (err) {
      hapticWarning();
      showSnackbar(err instanceof Error ? err.message : "Could not remove player.");
    }
  }

  if (loading) {
    return (
      <>
        {roundDetailLive}
        <View style={styles.center}>
          <ActivityIndicator color={colors.fairway} />
        </View>
      </>
    );
  }

  if (!round) {
    return (
      <>
        {roundDetailLive}
        <View style={styles.center}>
          <Text style={styles.errorText}>{error ?? "Round not found."}</Text>
        </View>
      </>
    );
  }

  const canInviteUsers = apiResolved && (round.isHost || round.currentUserSpotStatus === "confirmed");
  const canUseGroupChat = apiResolved && (round.isHost || round.currentUserSpotStatus === "confirmed");
  const pendingJoinRequest =
    apiResolved &&
    !round.isHost &&
    round.currentUserSpotStatus === "requested";
  const showRsvpActions =
    apiResolved &&
    !round.isHost &&
    !pendingJoinRequest &&
    (!round.currentUserSpotStatus ||
      round.currentUserSpotStatus === "invited" ||
      round.currentUserSpotStatus === "declined");
  function openInviteFriends() {
    setInviteSheetOpen(true);
  }

  /** Stack header + extra slack so KAV padding clears the keyboard under the composer. */
  const kavOffset = headerHeight + 32;
  const isScheduledOrTournament =
    round.mode === "scheduled" || round.mode === "tournament";
  const resolvedTournamentTitle = resolveTournamentTitle(round);
  /** Avoid flashing course name as headline before GET /api/rounds/:token returns a title. */
  const tournamentTitlePending =
    round.mode === "tournament" && !resolvedTournamentTitle && !apiResolved;

  return (
    <View style={styles.screenRoot}>
      {roundDetailLive}
      <KeyboardAvoidingView
        style={styles.keyboardFill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={kavOffset}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.container}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadRound({ silent: true }).finally(() => setRefreshing(false));
              }}
              tintColor={colors.fairway}
            />
          }
        >
      {isScheduledOrTournament ? (
        <>
          <View style={styles.heroCard}>
            <View style={styles.heroImageWrap}>
              <RoundCoverImage
                recyclingKey={`${round.id}:${round.imageUrl}`}
                uri={toAbsoluteUrl(round.imageUrl)}
                style={styles.hero}
                transitionMs={320}
              />
              <Pressable
                style={styles.heroLocationPin}
                onPress={() => setCourseLocationSheetOpen(true)}
                hitSlop={8}
                accessibilityLabel="Course location and directions"
                accessibilityRole="button"
              >
                <View style={styles.heroLocationPinInner}>
                  <Ionicons name="location" size={22} color={colors.fairway} />
                </View>
              </Pressable>
            </View>
          </View>
          {round.mode === "tournament" ? (
            <View style={styles.modeBadgeRow}>
              <Ionicons name="trophy-outline" size={16} color={colors.mustard} />
              <Text style={styles.modeBadgeText}>Tournament</Text>
            </View>
          ) : null}
          {tournamentTitlePending ? (
            <View
              style={[styles.titleBelowHero, styles.tournamentTitleLoading]}
              accessibilityLabel="Loading tournament title"
            >
              <ActivityIndicator size="small" color={colors.muted} />
            </View>
          ) : (
            <Text style={[styles.title, styles.titleBelowHero]} numberOfLines={3}>
              {round.mode === "tournament"
                ? (resolvedTournamentTitle || round.courseName)
                : round.courseName}
            </Text>
          )}
          {round.mode === "tournament" &&
          !tournamentTitlePending &&
          resolvedTournamentTitle &&
          round.courseName?.trim() &&
          resolvedTournamentTitle.toLowerCase() !== round.courseName.trim().toLowerCase() ? (
            <Text style={styles.tournamentCourseSubtitle} numberOfLines={2}>
              {round.courseName}
            </Text>
          ) : null}
        </>
      ) : (
        <>
          <PlanningRoundBadge
            preferredTimeWindow={getTimeWindows(round)}
            compact
          />
          <Text style={[styles.title, { marginTop: 8 }]}>
            {new Date(round.targetDate).toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </Text>
          <View style={styles.whenBlock}>
            <Text style={styles.whenDate}>{formatPlanningWindow(getTimeWindows(round))}</Text>
            {round.planningLocation?.trim() ? (
              <Text style={styles.whenTime}>{round.planningLocation.trim()}</Text>
            ) : null}
          </View>
        </>
      )}
      {isScheduledOrTournament && round.teeTime ? (
        <View style={styles.whenBlock}>
          <Text style={styles.whenFriendlyLine}>
            {formatFriendlyTeeDateTime(round.teeTime)}
          </Text>
        </View>
      ) : null}
      {round.mode === "tournament" && round.tournamentDetails?.trim() ? (
        <View style={styles.tournamentDetailsSection}>
          <Text style={styles.tournamentDetailsHeading}>About this tournament</Text>
          <TournamentMarkdownBody
            source={round.tournamentDetails!.trim()}
            baseStyle={styles.tournamentDetailsBody}
          />
        </View>
      ) : null}
      {apiResolved && round.isHost && (round.hostInvitedPlayers?.length ?? 0) > 0 ? (
        <View style={styles.claimedRow}>
          <Text style={styles.claimedLabel}>Invited</Text>
          <HostInvitedSpotsScrollRow
            roundId={round.id}
            players={round.hostInvitedPlayers ?? []}
            size="md"
            initialTone="muted"
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
            onPlayerLongPress={
              round.isHost && apiResolved
                ? (player) => setHostSpotMenuPlayer(player)
                : undefined
            }
          />
        </View>
      ) : null}
      <View style={styles.claimedRow}>
        <Text style={styles.claimedLabel}>
          Claimed {round.confirmedPlayers.length}/{round.totalSpots}
        </Text>
        <ConfirmedSpotsRow
          roundId={round.id}
          totalSpots={round.totalSpots}
          players={round.confirmedPlayers}
          size="md"
          initialTone="muted"
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
          onPlayerLongPress={
            round.isHost && apiResolved
              ? (player) => setHostSpotMenuPlayer(player)
              : undefined
          }
        />
      </View>
      {round.declinedPlayers.length > 0 ? (
        <View style={styles.claimedRow}>
          <Text style={styles.claimedLabel}>Declined</Text>
          <HostInvitedSpotsScrollRow
            roundId={`${round.id}-declined`}
            players={round.declinedPlayers}
            size="md"
            initialTone="muted"
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
          />
        </View>
      ) : null}

      {apiResolved && round.isHost && (round.pendingJoinRequests?.length ?? 0) > 0 ? (
        <View
          onLayout={(e) => {
            hostJoinRequestsSectionYRef.current = e.nativeEvent.layout.y;
          }}
        >
          <RoundDetailSection
            title="Join requests"
            hint="Players asked to join. Approve to add them to the group or decline to pass."
            icon="mail-unread-outline"
            expanded={hostJoinSectionExpanded}
            onToggle={() => setHostJoinSectionExpanded((e) => !e)}
          >
            {(round.pendingJoinRequests ?? []).map((p) => {
              const rowBusy = hostJoinBusyUserId === p.userId;
              const anyBusy = hostJoinBusyUserId != null;
              return (
                <View key={p.userId} style={styles.hostJoinRequestRow}>
                  <Pressable
                    style={styles.hostJoinRequestUserTap}
                    onPressIn={() => prefetchPublicProfile(p.userId, () => getTokenRef.current())}
                    onPress={() =>
                      router.push({
                        pathname: "/profile/[userId]",
                        params: {
                          userId: p.userId,
                          userName: p.name,
                          userAvatar: p.avatar ?? "",
                        },
                      })
                    }
                  >
                    {p.avatar ? (
                      <Image
                        source={toAbsoluteUrl(p.avatar)}
                        style={styles.hostJoinRequestAvatar}
                        transition={0}
                      />
                    ) : (
                      <InitialAvatar name={p.name} size={40} maxInitials={2} />
                    )}
                    <Text style={styles.hostJoinRequestName} numberOfLines={1}>
                      {p.name}
                    </Text>
                  </Pressable>
                  <View style={styles.hostJoinRequestActions}>
                    <Pressable
                      style={[
                        styles.hostJoinApproveBtn,
                        anyBusy && styles.disabledButton,
                      ]}
                      onPress={() => void hostResolveGuestJoinRequest(p.userId, "accept")}
                      disabled={anyBusy}
                    >
                      {rowBusy ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.hostJoinApproveBtnText}>Approve</Text>
                      )}
                    </Pressable>
                    <Pressable
                      style={[
                        styles.hostJoinDeclineBtn,
                        anyBusy && styles.disabledButton,
                      ]}
                      onPress={() => void hostResolveGuestJoinRequest(p.userId, "decline")}
                      disabled={anyBusy}
                    >
                      <Text style={styles.hostJoinDeclineBtnText}>Decline</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </RoundDetailSection>
        </View>
      ) : null}

      {pendingJoinRequest ? (
        <View style={styles.joinRequestPendingBlock}>
          <View style={styles.joinRequestPendingRow}>
            <Ionicons name="hourglass-outline" size={22} color={colors.mustard} />
            <View style={styles.joinRequestPendingTextCol}>
              <Text style={styles.joinRequestPendingTitle}>Request pending</Text>
              <Text style={styles.joinRequestPendingSub}>
                You asked to join. The host will approve or decline.
              </Text>
            </View>
          </View>
          <Pressable
            style={({ pressed }) => [
              btn.secondaryButton,
              styles.fullWidthSecondaryBtn,
              pressed && !busy && btn.pressed,
              busy && styles.disabledButton,
            ]}
            onPress={() => void cancelJoinRequest()}
            disabled={busy}
            accessibilityLabel="Cancel join request"
          >
            <Text style={btn.secondaryText}>
              {busy ? "Updating..." : "Cancel request"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {showRsvpActions ? (
        <View style={btn.actions}>
          <Pressable
            style={({ pressed }) => [
              btn.primaryButton,
              pressed && !busy && btn.pressed,
              busy && styles.disabledButton,
            ]}
            onPress={() => void rsvp("claim")}
            disabled={busy}
          >
            <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
            <Text style={btn.primaryText}>
              {busy
                ? "Updating..."
                : round.joinPolicy === "approval"
                  ? "Request to join"
                  : round.mode === "planning"
                    ? "I'm in"
                    : "Claim spot"}
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              btn.secondaryButton,
              pressed && !busy && btn.pressed,
              busy && styles.disabledButton,
            ]}
            onPress={() => void rsvp("decline")}
            disabled={busy}
          >
            <Ionicons name="close-circle-outline" size={20} color={colors.fairway} />
            <Text style={btn.secondaryText}>Decline</Text>
          </Pressable>
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      

      {apiResolved && round.isHost && round.mode === "planning" ? (
        <RoundDetailSection
          title="Finalize details"
          hint="Pick course and tee time for your group."
          icon="calendar-outline"
          expanded={finalizeExpanded}
          onToggle={() => setFinalizeExpanded((e) => !e)}
        >
          <Text style={styles.sectionLabel}>Course</Text>
          <View style={styles.inputRow}>
            <TextInput
              value={finalizeQuery}
              onChangeText={(value) => {
                setFinalizeQuery(value);
                if (finalizeCourse && value !== finalizeCourse.name) {
                  setFinalizeCourse(null);
                }
              }}
              onFocus={() => finalizeResults.length > 0 && setShowFinalizeResults(true)}
              placeholder="Search golf courses..."
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.inputWithClear]}
            />
            {loadingFinalizeCourses &&
            !finalizeCourse &&
            finalizeQuery.trim().length >= 2 ? (
              <View style={styles.inputAccessory}>
                <ActivityIndicator size="small" color={colors.muted} />
              </View>
            ) : null}
            {finalizeCourse ? (
              <Pressable
                style={styles.inputAccessory}
                onPress={() => {
                  setFinalizeCourse(null);
                  setFinalizeQuery("");
                  setFinalizeResults([]);
                  setShowFinalizeResults(false);
                }}
              >
                <Ionicons name="close" size={15} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
          {showFinalizeResults && finalizeResults.map((course) => (
            <Pressable
              key={course.id}
              style={styles.listRow}
              onPress={() => {
                setFinalizeCourse(course);
                setFinalizeQuery(course.name);
                setFinalizeResults([]);
              }}
            >
              <Text style={styles.listTitle}>{course.name}</Text>
              <Text style={styles.listMeta}>{course.address}</Text>
            </Pressable>
          ))}

          <Text style={styles.sectionLabel}>Tee time</Text>
          <View style={styles.inlineRow}>
            <Pressable style={[styles.datePickerBtn, styles.flex1]} onPress={openCalendar}>
              <Text
                style={[
                  styles.datePickerText,
                  !finalizeTeeDate && styles.datePickerPlaceholder,
                ]}
              >
                {formatDateLabel(finalizeTeeDate)}
              </Text>
              <Ionicons name="calendar-outline" size={18} color={colors.fairway} />
            </Pressable>
            <Pressable
              style={[styles.datePickerBtn, styles.flex1]}
              onPress={() => { Keyboard.dismiss(); setTimePickerOpen(true); }}
            >
              <Text style={styles.datePickerText}>
                {formatTimeLabel(finalizeTeeTimeValue)}
              </Text>
              <Ionicons name="time-outline" size={18} color={colors.fairway} />
            </Pressable>
          </View>
          {finalizeError ? <Text style={styles.errorText}>{finalizeError}</Text> : null}
          <Pressable
            style={({ pressed }) => [
              btn.primaryButton,
              styles.fullWidthPrimaryBtn,
              pressed && !finalizeBusy && btn.pressed,
              finalizeBusy && styles.disabledButton,
            ]}
            onPress={() => void finalizeRound()}
            disabled={finalizeBusy}
          >
            <Ionicons name="calendar-outline" size={20} color="#fff" />
            <Text style={btn.primaryText}>
              {finalizeBusy ? "Finalizing..." : "Finalize round"}
            </Text>
          </Pressable>
        </RoundDetailSection>
      ) : null}

      {canUseGroupChat && token && round.conversationId ? (
        <Pressable
          style={({ pressed }) => [
            styles.chatPreviewRow,
            pressed && styles.chatPreviewRowPressed,
          ]}
          onPress={() => {
            const playerAvatars = round.confirmedPlayers
              .map((p) => p.avatar)
              .filter((a): a is string => Boolean(a));
            const headerAvatars =
              (round.mode === "scheduled" || round.mode === "tournament") && round.imageUrl
                ? [round.imageUrl, ...playerAvatars]
                : playerAvatars;
            const datePart = round.teeTime
              ? formatFriendlyTeeDateTime(round.teeTime)
              : round.targetDate
                ? new Date(round.targetDate).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })
                : "";
            const chatDisplayName =
              round.mode === "tournament"
                ? (resolveTournamentTitle(round) || round.courseName)
                : round.courseName;
            const chatTitle =
              (round.mode === "scheduled" || round.mode === "tournament") && chatDisplayName
                ? `${chatDisplayName} · ${datePart}`
                : datePart || "Group chat";
            router.push({
              pathname: "/conversation/[id]/chat",
              params: {
                id: round.conversationId!,
                chatTitle,
                chatAvatars: JSON.stringify(headerAvatars.slice(0, 4)),
                chatType: "round",
              },
            });
          }}
          accessibilityLabel="Open group chat"
          accessibilityRole="button"
        >
          <View style={styles.chatPreviewIconWrap}>
            <Ionicons name="chatbubbles-outline" size={22} color={colors.fairway} />
          </View>
          <View style={styles.chatPreviewTextCol}>
            <Text style={styles.chatPreviewTitle}>Group chat</Text>
            <Text style={styles.chatPreviewSubtitle} numberOfLines={2}>
              {groupChatPreviewSubtitle(round.lastChatMessage)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>
      ) : null}

      {canUseGroupChat && token && round.confirmedPlayers.length >= 2 ? (
        <Pressable
          style={({ pressed }) => [
            styles.chatPreviewRow,
            pressed && styles.chatPreviewRowPressed,
          ]}
          onPress={() => setSideGamesSheetOpen(true)}
          accessibilityLabel="Open side games for this round"
          accessibilityRole="button"
        >
          <View style={styles.chatPreviewIconWrap}>
            <Ionicons name="flag-outline" size={22} color={colors.fairway} />
          </View>
          <View style={styles.chatPreviewTextCol}>
            <Text style={styles.chatPreviewTitle}>Side games</Text>
            <Text style={styles.chatPreviewSubtitle} numberOfLines={2}>
              Skins, Wolf, and more with everyone in this round.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>
      ) : null}

      {round.status === "completed" ? (
        <Pressable
          style={({ pressed }) => [styles.chatPreviewRow, pressed && styles.chatPreviewRowPressed]}
          onPress={() =>
            router.push({
              pathname: "/round/[token]/results",
              params: { token },
            })
          }
          accessibilityLabel="View round recap"
          accessibilityRole="button"
        >
          <View style={styles.chatPreviewIconWrap}>
            <Ionicons name="podium-outline" size={22} color={colors.fairway} />
          </View>
          <View style={styles.chatPreviewTextCol}>
            <Text style={styles.chatPreviewTitle}>Round recap</Text>
            <Text style={styles.chatPreviewSubtitle} numberOfLines={2}>
              Highlights and Wolf standings from games linked to this round.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>
      ) : null}

      {canInviteUsers ? (
        <RoundDetailSection
          title="Invite players"
          hint="Choose friends to invite."
          icon="person-add-outline"
          expanded={false}
          onToggle={openInviteFriends}
        />
      ) : null}
      <DatePickerModal
        visible={calendarOpen}
        title="Select tee date"
        selectedDate={finalizeTeeDate}
        onSelectDate={onSelectCalendarDay}
        onClose={() => setCalendarOpen(false)}
        minimumDate={new Date()}
      />

      <TimePickerModal
        visible={timePickerOpen}
        title="Select tee time"
        value={finalizeTeeTimeValue}
        onChange={setFinalizeTeeTimeValue}
        onClose={() => setTimePickerOpen(false)}
      />
        </ScrollView>
      </KeyboardAvoidingView>

      <OverflowMenuSheet
        visible={roundMenuOpen}
        onClose={() => setRoundMenuOpen(false)}
        items={
          round.isHost
            ? [
                {
                  key: "share",
                  label: "Share invite link",
                  icon: "share-outline" as const,
                  onPress: () => void shareInviteLink(),
                },
                {
                  key: "calendar",
                  label: "Add to calendar",
                  icon: "calendar-outline" as const,
                  onPress: () => {
                    void presentAddRoundToCalendar(round);
                  },
                },
                {
                  key: "edit",
                  label: "Edit round",
                  icon: "create-outline" as const,
                  onPress: () => {
                    router.push({
                      pathname: "/round/[token]/edit",
                      params: { token: round.inviteToken },
                    });
                  },
                },
                {
                  key: "delete",
                  label: "Delete round",
                  icon: "trash-outline" as const,
                  onPress: () => confirmDeleteRound(),
                  destructive: true,
                },
              ]
            : [
                {
                  key: "share",
                  label: "Share invite link",
                  icon: "share-outline" as const,
                  onPress: () => void shareInviteLink(),
                },
                {
                  key: "calendar",
                  label: "Add to calendar",
                  icon: "calendar-outline" as const,
                  onPress: () => {
                    void presentAddRoundToCalendar(round);
                  },
                },
                ...(round.currentUserSpotStatus === "requested"
                  ? [
                      {
                        key: "cancel-request",
                        label: "Cancel join request",
                        icon: "close-circle-outline" as const,
                        onPress: () => {
                          void cancelJoinRequest();
                        },
                      },
                    ]
                  : round.currentUserSpotStatus === "confirmed"
                    ? [
                        {
                          key: "unclaim",
                          label: "Unclaim spot",
                          icon: "close-circle-outline" as const,
                          onPress: () => {
                            void rsvp("decline");
                          },
                        },
                      ]
                    : []),
                {
                  key: "report",
                  label: "Report round",
                  icon: "flag-outline" as const,
                  destructive: true,
                  onPress: () => {
                    setTimeout(() => setReportRoundOpen(true), 350);
                  },
                },
              ]
        }
      />

      <OverflowMenuSheet
        visible={hostSpotMenuPlayer !== null}
        onClose={() => setHostSpotMenuPlayer(null)}
        items={
          hostSpotMenuPlayer
            ? [
                ...(hostSpotMenuPlayer.id !== round.hostId
                  ? [
                      {
                        key: "remove-spot",
                        label: "Remove user",
                        icon: "trash-outline" as const,
                        destructive: true,
                        onPress: () => {
                          const p = hostSpotMenuPlayer;
                          Alert.alert(
                            "Remove player?",
                            `${p.name} will be removed from this round.`,
                            [
                              { text: "Cancel", style: "cancel" },
                              {
                                text: "Remove",
                                style: "destructive",
                                onPress: () => void removeGuestFromRound(p),
                              },
                            ],
                          );
                        },
                      },
                    ]
                  : []),
                {
                  key: "view-profile-spot",
                  label: "View profile",
                  icon: "person-outline" as const,
                  onPress: () => {
                    const p = hostSpotMenuPlayer;
                    router.push({
                      pathname: "/profile/[userId]",
                      params: {
                        userId: p.id,
                        userName: p.name,
                        userAvatar: p.avatar ?? "",
                      },
                    });
                  },
                },
              ]
            : []
        }
      />

      <ReportSheet
        visible={reportRoundOpen}
        onClose={() => setReportRoundOpen(false)}
        contentType="round"
        contentId={round?.id ?? ""}
        targetUserId={round?.hostId}
        targetLabel="this round"
      />

      <InviteFriendsSheet
        visible={inviteSheetOpen}
        onClose={() => setInviteSheetOpen(false)}
        onConfirm={(users) => {
          setInviteSheetOpen(false);
          void sendInvites(users);
        }}
        confirmLabel="Send invites"
        excludeIds={inviteFriendExcludeIds}
      />

      <AnimatedBottomSheetFrame
        visible={sideGamesSheetOpen}
        onClose={() => setSideGamesSheetOpen(false)}
        backdropAccessibilityLabel="Dismiss side games"
        snapPoints={SIDE_GAMES_SHEET_SNAP_POINTS}
        enableContentPanningGesture={false}
        sheetStyle={styles.sideGamesSheet}
      >
        <View style={styles.sideGamesSheetInner}>
          <Text style={styles.sideGamesTitle}>Side games</Text>
          <Text style={styles.sideGamesSub}>
            Pick a game — confirmed players are added automatically.
          </Text>
          <BottomSheetScrollView
            style={styles.sideGamesScroll}
            contentContainerStyle={styles.sideGamesScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {sideGameDefs.map((g) => (
                <Pressable
                  key={g.id}
                  style={({ pressed }) => [
                    styles.sideGameCard,
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => {
                    setSideGamesSheetOpen(false);
                    setTimeout(() => {
                      router.push({
                        pathname: "/games/create",
                        params: { gameType: g.id, roundInviteToken: token },
                      });
                    }, 300);
                  }}
                >
                  <Ionicons name="golf-outline" size={22} color={colors.fairway} />
                  <Text style={styles.sideGameCardTitle}>{g.title}</Text>
                  <Text style={styles.sideGameCardSub} numberOfLines={2}>
                    {g.subtitle}
                  </Text>
                </Pressable>
              ))}
          </BottomSheetScrollView>
        </View>
      </AnimatedBottomSheetFrame>

      <RoundCourseLocationSheet
        visible={courseLocationSheetOpen}
        onClose={() => setCourseLocationSheetOpen(false)}
        courseName={round.courseName}
        courseAddress={round.courseAddress}
        courseLatitude={round.courseLatitude}
        courseLongitude={round.courseLongitude}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1, backgroundColor: colors.background },
  keyboardFill: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 8, paddingBottom: 32 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 11,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroImageWrap: {
    position: "relative",
    width: "100%",
    borderRadius: 12,
    overflow: "hidden",
  },
  hero: {
    width: "100%",
    height: 180,
    borderRadius: 12,
  },
  heroLocationPin: {
    position: "absolute",
    bottom: 10,
    right: 10,
  },
  heroLocationPinInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.94)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.text,
  },
  titleBelowHero: {
    marginTop: 8,
  },
  tournamentTitleLoading: {
    minHeight: 36,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  modeBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#f5f0d8",
    borderWidth: 1,
    borderColor: "rgba(201, 162, 39, 0.35)",
  },
  modeBadgeText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  tournamentCourseSubtitle: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: "600",
    color: colors.muted,
  },
  tournamentDetailsSection: {
    marginTop: 14,
    gap: 8,
  },
  tournamentDetailsHeading: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  tournamentDetailsBody: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
  },
  whenBlock: { gap: 2, marginTop: 2 },
  whenDate: { color: colors.text, fontWeight: "700", fontSize: 18 },
  whenTime: { color: colors.muted, fontWeight: "600", fontSize: 16 },
  whenFriendlyLine: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 17,
    lineHeight: 24,
  },
  claimedRow: { marginTop: 10, gap: 6 },
  claimedLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  claimedThumbFallback: {
    backgroundColor: "#f1efea",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  claimedThumbInitial: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  chatPreviewRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chatPreviewRowPressed: { opacity: 0.92 },
  chatPreviewIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: colors.fairwaySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  chatPreviewTextCol: { flex: 1, minWidth: 0, gap: 4 },
  chatPreviewTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  chatPreviewSubtitle: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  disabledButton: { opacity: 0.5 },
  /** Single primary CTA in a column (finalize); overrides `flex: 1` from shared RSVP styles. */
  fullWidthPrimaryBtn: { flex: 0, width: "100%", alignSelf: "stretch" },
  fullWidthSecondaryBtn: { flex: 0, width: "100%", alignSelf: "stretch", marginTop: 10 },
  joinRequestPendingBlock: {
    marginTop: 16,
    width: "100%",
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 0,
  },
  joinRequestPendingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  joinRequestPendingTextCol: { flex: 1, minWidth: 0, gap: 4 },
  joinRequestPendingTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  joinRequestPendingSub: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  hostJoinRequestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  hostJoinRequestUserTap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  hostJoinRequestAvatar: { width: 40, height: 40, borderRadius: 20 },
  hostJoinRequestName: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.text },
  hostJoinRequestActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  hostJoinApproveBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.fairway,
    minWidth: 84,
    alignItems: "center",
  },
  hostJoinApproveBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  hostJoinDeclineBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hostJoinDeclineBtnText: { color: colors.text, fontWeight: "600", fontSize: 13 },
  errorText: {
    color: colors.danger,
    backgroundColor: "#fee4e2",
    padding: 10,
    borderRadius: 12,
    marginTop: 8,
  },
  
  sectionLabel: {
    color: colors.muted,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontWeight: "700",
    marginTop: 2,
  },
  inlineRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: {
    backgroundColor: "#f1efea",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    color: colors.text,
  },
  inputRow: {
    position: "relative",
  },
  inputWithClear: {
    paddingRight: 36,
  },
  inputAccessory: {
    position: "absolute",
    right: 10,
    top: 10,
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ece8e1",
  },
  flex1: { flex: 1 },
  datePickerBtn: {
    backgroundColor: "#f1efea",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  datePickerText: { color: colors.text, fontWeight: "600" },
  datePickerPlaceholder: { color: colors.muted, fontWeight: "500" },
  searchBtn: {
    backgroundColor: colors.fairway,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  searchBtnText: { color: "#fff", fontWeight: "700" },
  listRow: {
    backgroundColor: "#f9f7f3",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  listTitle: { color: colors.text, fontWeight: "600" },
  listMeta: { color: colors.muted, fontSize: 12 },
  sideGamesSheet: { paddingHorizontal: 16, paddingTop: 8, flex: 1 },
  sideGamesSheetInner: { flex: 1, minHeight: 0 },
  sideGamesTitle: { fontSize: 20, fontWeight: "800", color: colors.text, marginBottom: 4 },
  sideGamesSub: { fontSize: 14, color: colors.muted, marginBottom: 12 },
  sideGamesScroll: { flex: 1 },
  sideGamesScrollContent: { gap: 10, paddingBottom: 8 },
  sideGameCard: {
    backgroundColor: "#f9f7f3",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sideGameCardTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginTop: 6 },
  sideGameCardSub: { fontSize: 13, color: colors.muted, marginTop: 2, lineHeight: 18 },
});
