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
import { hapticSuccess, hapticWarning, hapticLight } from "../../lib/haptics";
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
import { colors } from "../../lib/theme";
import { RoundDetails } from "../../types/round";

function groupChatPreviewSubtitle(last: RoundDetails["lastChatMessage"]): string {
  if (!last) return "No messages yet. Say hi!";
  const snippet = last.body.replace(/\s+/g, " ").trim();
  const max = 160;
  const cut = snippet.length > max ? `${snippet.slice(0, max)}…` : snippet;
  return `${formatInviterFirstLastInitial(last.senderName)}: ${cut}`;
}
import { ConfirmedSpotsRow } from "../../components/confirmed-spots-row";
import { OverflowMenuSheet } from "../../components/overflow-menu-sheet";
import { RoundDetailSection } from "../../components/round-detail-section";
import { PlanningRoundBadge } from "../../components/planning-round-badge";
import { DatePickerModal } from "../../components/date-picker-modal";
import { TimePickerModal } from "../../components/time-picker-modal";

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
  window: "morning" | "afternoon" | "twilight" | null | undefined,
) {
  if (!window) return "time TBD";
  return window.charAt(0).toUpperCase() + window.slice(1);
}

export default function RoundDetailsScreen() {
  const { token, roundHint } = useLocalSearchParams<{
    token: string;
    roundHint?: string | string[];
  }>();
  const router = useRouter();
  const navigation = useNavigation();
  const headerHeight = useHeaderHeight();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const ablyChatMounted = useAblyChatMounted();
  const scrollRef = useRef<ScrollView>(null);
  const [round, setRound] = useState<RoundDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isFirstFocusRef = useRef(true);
  const [busy, setBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
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
  const [finalizeBusy, setFinalizeBusy] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const debouncedFinalizeQuery = useDebounce(finalizeQuery, 320);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [finalizeExpanded, setFinalizeExpanded] = useState(true);
  const [inviteSheetOpen, setInviteSheetOpen] = useState(false);
  const confirmedPlayerIds = useMemo(
    () => new Set(round?.confirmedPlayers.map((p) => p.id) ?? []),
    [round],
  );

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

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

  useEffect(() => {
    if (round) {
      setCachedRoundDetails(round);
    }
  }, [round]);

  useLayoutEffect(() => {
    if (loading || !round) {
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
  }, [navigation, loading, round]);

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
          { query: q },
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
  }, [debouncedFinalizeQuery, finalizeCourse]);


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
      setMessage("Round finalized.");
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

  async function rsvp(action: "claim" | "decline") {
    if (!token || !round) return;
    const wasConfirmed = round.currentUserSpotStatus === "confirmed";
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const authToken = await getToken();
      const result = await apiPost<{ status?: "confirmed" | "requested" | "declined" }>(
        `/api/rounds/${token}/join`,
        { action },
        authToken,
      );
      const refreshed = await fetchRoundDetailsAndCache(token, authToken);
      setRound(refreshed);

      hapticSuccess();
      if (result.status === "requested") {
        setMessage("Join request submitted.");
      } else if (result.status === "declined" || action === "decline") {
        setMessage(wasConfirmed ? "Spot released." : "Declined.");
      } else {
        setMessage("Spot claimed.");
      }
    } catch (submitError) {
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
    setMessage(null);
    try {
      const authToken = await getToken();
      await apiDelete<{ ok: boolean }>(`/api/rounds/${token}`, authToken);
      emitRoundListsShouldRefresh();
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
    setMessage(null);
    try {
      const authToken = await getTokenRef.current();
      const response = await apiPost<{ invitedCount: number; skippedCount: number }>(
        `/api/rounds/${token}/invites`,
        { inviteeUserIds: users.map((u) => u.id) },
        authToken,
      );
      setMessage(
        response.invitedCount > 0
          ? `Invite blast sent to ${response.invitedCount} golfer${response.invitedCount === 1 ? "" : "s"}.`
          : "No new invites were sent.",
      );
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "Unable to send invites.");
    } finally {
      setInviteBusy(false);
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

  const canInviteUsers = round.isHost || round.currentUserSpotStatus === "confirmed";
  const canUseGroupChat = round.isHost || round.currentUserSpotStatus === "confirmed";
  const showRsvpActions =
    !round.isHost &&
    (!round.currentUserSpotStatus ||
      round.currentUserSpotStatus === "invited" ||
      round.currentUserSpotStatus === "declined");
  function openInviteFriends() {
    setInviteSheetOpen(true);
  }

  /** Stack header + extra slack so KAV padding clears the keyboard under the composer. */
  const kavOffset = headerHeight + 32;

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
      {round.mode === "scheduled" ? (
        <>
          <RoundCoverImage
            recyclingKey={`${round.id}:${round.imageUrl}`}
            uri={toAbsoluteUrl(round.imageUrl)}
            style={styles.hero}
            transitionMs={320}
          />
          <Text style={styles.title}>{round.courseName}</Text>
        </>
      ) : (
        <>
          <PlanningRoundBadge
            preferredTimeWindow={round.preferredTimeWindow}
            compact
          />
          <Text style={styles.title}>
            {new Date(round.targetDate).toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </Text>
          <View style={styles.whenBlock}>
            <Text style={styles.whenDate}>{formatPlanningWindow(round.preferredTimeWindow)}</Text>
            {round.planningLocation?.trim() ? (
              <Text style={styles.whenTime}>{round.planningLocation.trim()}</Text>
            ) : null}
          </View>
        </>
      )}
      {round.mode === "scheduled" ? (
        <View style={styles.whenBlock}>
          <Text style={styles.whenDate}>
            {new Date(round.teeTime as string).toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </Text>
          <Text style={styles.whenTime}>
            {new Date(round.teeTime as string).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </Text>
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
        />
      </View>
      {round.declinedPlayers.length > 0 ? (
        <View style={styles.declinedRow}>
          <Text style={styles.claimedLabel}>Declined</Text>
          <View style={styles.declinedList}>
            {round.declinedPlayers.map((player) => (
              <Pressable
                key={player.id}
                style={styles.declinedChip}
                onPressIn={() => prefetchPublicProfile(player.id, () => getTokenRef.current())}
                onPress={() =>
                  router.push({
                    pathname: "/profile/[userId]",
                    params: {
                      userId: player.id,
                      userName: player.name,
                      userAvatar: player.avatar ?? "",
                    },
                  })
                }
              >
                {player.avatar ? (
                  <Image source={toAbsoluteUrl(player.avatar)} style={styles.declinedAvatar} transition={0} />
                ) : (
                  <View style={[styles.declinedAvatar, styles.claimedThumbFallback]}>
                    <Text style={styles.claimedThumbInitial}>
                      {player.name.trim().charAt(0).toUpperCase() || "?"}
                    </Text>
                  </View>
                )}
                <Text style={styles.declinedName}>{player.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {showRsvpActions ? (
        <View style={btn.actions}>
          <Pressable
            style={[btn.button, btn.primaryButton, busy && styles.disabledButton]}
            onPress={() => void rsvp("claim")}
            disabled={busy}
          >
            <Text style={btn.primaryText}>
              {busy ? "Updating..." : round.mode === "planning" ? "I'm in" : "Claim spot"}
            </Text>
          </Pressable>
          <Pressable
            style={[btn.button, btn.secondaryButton, busy && styles.disabledButton]}
            onPress={() => void rsvp("decline")}
            disabled={busy}
          >
            <Text style={btn.secondaryText}>Decline</Text>
          </Pressable>
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {message ? <Text style={styles.successText}>{message}</Text> : null}

      {round.isHost && round.mode === "planning" ? (
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
            style={[btn.button, btn.primaryButton, finalizeBusy && styles.disabledButton]}
            onPress={() => void finalizeRound()}
            disabled={finalizeBusy}
          >
            <Text style={btn.primaryText}>
              {finalizeBusy ? "Finalizing..." : "Finalize round"}
            </Text>
          </Pressable>
        </RoundDetailSection>
      ) : null}

      {canUseGroupChat && token ? (
        <Pressable
          style={({ pressed }) => [
            styles.chatPreviewRow,
            pressed && styles.chatPreviewRowPressed,
          ]}
          onPress={() =>
            router.push({
              pathname: "/round/[token]/chat",
              params: { token },
            })
          }
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
          onPress={() =>
            router.push({
              pathname: "/games",
              params: { roundInviteToken: token },
            })
          }
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
                {
                  key: "unclaim",
                  label: "Unclaim spot",
                  icon: "close-circle-outline" as const,
                  onPress: () => {
                    void rsvp("decline");
                  },
                },
              ]
        }
      />

      <InviteFriendsSheet
        visible={inviteSheetOpen}
        onClose={() => setInviteSheetOpen(false)}
        onConfirm={(users) => {
          setInviteSheetOpen(false);
          void sendInvites(users);
        }}
        confirmLabel="Send invites"
        excludeIds={confirmedPlayerIds}
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
  hero: {
    width: "100%",
    height: 180,
    borderRadius: 16,
  },
  title: { fontSize: 28, fontWeight: "700", color: colors.text, marginTop: 8 },
  whenBlock: { gap: 2, marginTop: 2 },
  whenDate: { color: colors.text, fontWeight: "700", fontSize: 18 },
  whenTime: { color: colors.muted, fontWeight: "600", fontSize: 16 },
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
  declinedRow: { marginTop: 8, gap: 6 },
  declinedList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  declinedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#f5f3ef",
    borderWidth: 1,
    borderColor: colors.border,
  },
  declinedAvatar: { width: 22, height: 22, borderRadius: 999 },
  declinedName: { color: colors.muted, fontSize: 12, fontWeight: "600" },
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
  errorText: {
    color: colors.danger,
    backgroundColor: "#fee4e2",
    padding: 10,
    borderRadius: 12,
    marginTop: 8,
  },
  successText: {
    color: colors.fairway,
    backgroundColor: colors.fairwaySoft,
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
});
