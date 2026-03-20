import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import {
  Share,
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiBaseUrl, apiDelete, apiGet, apiPost, toAbsoluteUrl } from "../../lib/api";
import { colors } from "../../lib/theme";
import { RoundDetails } from "../../types/round";
import { DatePickerModal } from "../../components/date-picker-modal";
import { TimePickerModal } from "../../components/time-picker-modal";

type RoundResponse = { round: RoundDetails };
type CourseResult = { id: string; name: string; address: string };
type UserSearchResult = {
  id: string;
  name: string;
  email: string | null;
  avatar: string | null;
};

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
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const [round, setRound] = useState<RoundDetails | null>(null);
  const [loading, setLoading] = useState(true);
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
  const [finalizeBusy, setFinalizeBusy] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const debouncedFinalizeQuery = useDebounce(finalizeQuery, 320);
  const [friendQuery, setFriendQuery] = useState("");
  const [friendResults, setFriendResults] = useState<UserSearchResult[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<UserSearchResult[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [showFriendResults, setShowFriendResults] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const debouncedFriendQuery = useDebounce(friendQuery, 320);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const loadRound = useCallback(async () => {
    if (!token) return;
    try {
      setError(null);
      const authToken = await getTokenRef.current();
      const data = await apiGet<RoundResponse>(`/api/rounds/${token}`, authToken);
      setRound(data.round);
      if (data.round.mode === "planning") {
        const target = new Date(data.round.targetDate);
        target.setHours(0, 0, 0, 0);
        setFinalizeTeeDate(target);
      }
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unable to load.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      void loadRound();
    }
  }, [token, loadRound]);

  useFocusEffect(
    useCallback(() => {
      void loadRound();
    }, [loadRound]),
  );

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

  useEffect(() => {
    let active = true;
    if (!round) return;
    const canInviteUsers = round.isHost || round.currentUserSpotStatus === "confirmed";
    if (!canInviteUsers) return;
    const confirmedPlayerIds = new Set(round.confirmedPlayers.map((player) => player.id));

    async function runFriendSearch() {
      const q = debouncedFriendQuery.trim();
      if (q.length < 2) {
        if (active) {
          setFriendResults([]);
          setShowFriendResults(false);
        }
        return;
      }
      setLoadingFriends(true);
      try {
        const authToken = await getTokenRef.current();
        const data = await apiGet<{ users: UserSearchResult[] }>(
          `/api/users/search?q=${encodeURIComponent(q)}`,
          authToken,
        );
        if (!active) return;
        setFriendResults(
          data.users.filter(
            (user) =>
              !selectedFriends.some((selected) => selected.id === user.id) &&
              !confirmedPlayerIds.has(user.id),
          ),
        );
        setShowFriendResults(true);
      } catch (searchError) {
        if (!active) return;
        setError(searchError instanceof Error ? searchError.message : "Failed to search users.");
      } finally {
        if (active) setLoadingFriends(false);
      }
    }

    void runFriendSearch();
    return () => {
      active = false;
    };
  }, [debouncedFriendQuery, selectedFriends, round]);

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
      const refreshed = await apiGet<RoundResponse>(`/api/rounds/${token}`, authToken);
      setRound(refreshed.round);
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
      const refreshed = await apiGet<RoundResponse>(`/api/rounds/${token}`, authToken);
      setRound(refreshed.round);

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

  async function deleteRound() {
    if (!token || !round?.isHost || deleteBusy) return;
    setDeleteBusy(true);
    setError(null);
    setMessage(null);
    try {
      const authToken = await getToken();
      await apiDelete<{ ok: boolean }>(`/api/rounds/${token}`, authToken);
      router.replace("/(tabs)");
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
    const inviteUrl = `${apiBaseUrl.replace(/\/$/, "")}/round/${round.inviteToken}`;
    const roundLabel = round.mode === "planning" ? "planning round" : round.courseName;
    try {
      await Share.share({
        message: `Join my ${roundLabel} on Partee: ${inviteUrl}`,
        url: inviteUrl,
      });
    } catch {
      setError("Unable to open share sheet.");
    }
  }

  async function sendInvites() {
    if (!token || selectedFriends.length === 0) return;
    setInviteBusy(true);
    setError(null);
    setMessage(null);
    try {
      const authToken = await getTokenRef.current();
      const response = await apiPost<{ invitedCount: number; skippedCount: number }>(
        `/api/rounds/${token}/invites`,
        { inviteeUserIds: selectedFriends.map((friend) => friend.id) },
        authToken,
      );
      setMessage(
        response.invitedCount > 0
          ? `Invite blast sent to ${response.invitedCount} golfer${response.invitedCount === 1 ? "" : "s"}.`
          : "No new invites were sent.",
      );
      setSelectedFriends([]);
      setFriendQuery("");
      setFriendResults([]);
      setShowFriendResults(false);
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "Unable to send invites.");
    } finally {
      setInviteBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.fairway} />
      </View>
    );
  }

  if (!round) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? "Round not found."}</Text>
      </View>
    );
  }

  const canInviteUsers = round.isHost || round.currentUserSpotStatus === "confirmed";
  const showRsvpActions =
    !round.isHost &&
    (!round.currentUserSpotStatus ||
      round.currentUserSpotStatus === "invited" ||
      round.currentUserSpotStatus === "declined");
  const showUnclaimAction = !round.isHost && round.currentUserSpotStatus === "confirmed";
  const claimedSlots = Array.from({ length: round.totalSpots }, (_, index) =>
    round.confirmedPlayers[index] ?? null,
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {round.mode === "scheduled" ? (
        <>
          <Image source={{ uri: toAbsoluteUrl(round.imageUrl) }} style={styles.hero} />
          <Text style={styles.title}>{round.courseName}</Text>
        </>
      ) : (
        <View style={styles.planningHeaderCard}>
          <Text style={styles.planningLabel}>Planning round</Text>
          <Text style={styles.planningDate}>
            {new Date(round.targetDate).toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </Text>
          <Text style={styles.planningTime}>{formatPlanningWindow(round.preferredTimeWindow)}</Text>
          {round.planningLocation ? (
            <Text style={styles.planningTime}>{round.planningLocation}</Text>
          ) : null}
        </View>
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
        <View style={styles.claimedThumbs}>
          {claimedSlots.map((player, idx) =>
            player ? (
              player.avatar ? (
                <Image
                  key={player.id}
                  source={{ uri: toAbsoluteUrl(player.avatar) }}
                  style={styles.claimedThumb}
                />
              ) : (
                <View key={player.id} style={[styles.claimedThumb, styles.claimedThumbFallback]}>
                  <Text style={styles.claimedThumbInitial}>
                    {player.name.trim().charAt(0).toUpperCase() || "?"}
                  </Text>
                </View>
              )
            ) : (
              <View key={`empty-${idx}`} style={[styles.claimedThumb, styles.emptyThumb]} />
            ),
          )}
        </View>
      </View>
      {round.declinedPlayers.length > 0 ? (
        <View style={styles.declinedRow}>
          <Text style={styles.claimedLabel}>Declined</Text>
          <View style={styles.declinedList}>
            {round.declinedPlayers.map((player) => (
              <View key={player.id} style={styles.declinedChip}>
                {player.avatar ? (
                  <Image source={{ uri: toAbsoluteUrl(player.avatar) }} style={styles.declinedAvatar} />
                ) : (
                  <View style={[styles.declinedAvatar, styles.claimedThumbFallback]}>
                    <Text style={styles.claimedThumbInitial}>
                      {player.name.trim().charAt(0).toUpperCase() || "?"}
                    </Text>
                  </View>
                )}
                <Text style={styles.declinedName}>{player.name}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {message ? <Text style={styles.successText}>{message}</Text> : null}

      {round.isHost && round.mode === "planning" ? (
        <View style={styles.finalizeCard}>
          <Text style={styles.finalizeTitle}>Finalize details</Text>
          <Text style={styles.meta}>Pick course and tee time for your group.</Text>

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
            {finalizeQuery.trim().length > 0 ? (
              <Pressable
                style={styles.inputClearBtn}
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
          {loadingFinalizeCourses ? <Text style={styles.listMeta}>Searching...</Text> : null}
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
              onPress={() => setTimePickerOpen(true)}
            >
              <Text style={styles.datePickerText}>
                {formatTimeLabel(finalizeTeeTimeValue)}
              </Text>
              <Ionicons name="time-outline" size={18} color={colors.fairway} />
            </Pressable>
          </View>
          {finalizeError ? <Text style={styles.errorText}>{finalizeError}</Text> : null}
          <Pressable
            style={[styles.button, styles.primaryButton, finalizeBusy && styles.disabledButton]}
            onPress={() => void finalizeRound()}
            disabled={finalizeBusy}
          >
            <Text style={styles.primaryText}>
              {finalizeBusy ? "Finalizing..." : "Finalize round"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {canInviteUsers ? (
        <View style={styles.inviteCard}>
          <Text style={styles.sectionLabel}>Invite players</Text>
          <TextInput
            value={friendQuery}
            onChangeText={setFriendQuery}
            onFocus={() => friendResults.length > 0 && setShowFriendResults(true)}
            placeholder="Search by name or email..."
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          {loadingFriends ? <Text style={styles.listMeta}>Searching...</Text> : null}
          {showFriendResults &&
            friendResults.map((friend) => (
              <Pressable
                key={friend.id}
                style={styles.listRow}
                onPress={() => {
                  setSelectedFriends((prev) =>
                    prev.some((existing) => existing.id === friend.id) ? prev : [...prev, friend],
                  );
                  setFriendResults((prev) => prev.filter((u) => u.id !== friend.id));
                }}
              >
                <Text style={styles.listTitle}>{friend.name}</Text>
                {friend.email ? <Text style={styles.listMeta}>{friend.email}</Text> : null}
              </Pressable>
            ))}
          {selectedFriends.map((friend) => (
            <View key={friend.id} style={styles.selectedRow}>
              <Text style={styles.selectedText}>{friend.name}</Text>
              <Pressable
                onPress={() =>
                  setSelectedFriends((prev) => prev.filter((user) => user.id !== friend.id))
                }
              >
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            </View>
          ))}
          <View style={styles.actions}>
            <Pressable
              style={[
                styles.button,
                styles.primaryButton,
                (inviteBusy || selectedFriends.length === 0) && styles.disabledButton,
              ]}
              onPress={() => void sendInvites()}
              disabled={inviteBusy || selectedFriends.length === 0}
            >
              <Text style={styles.primaryText}>
                {inviteBusy ? "Sending..." : "Send invites"}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.secondaryButton]}
              onPress={() => void shareInviteLink()}
            >
              <Text style={styles.secondaryText}>Share link</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {showRsvpActions ? (
        <View style={styles.actions}>
          <Pressable
            style={[styles.button, styles.primaryButton, busy && styles.disabledButton]}
            onPress={() => void rsvp("claim")}
            disabled={busy}
          >
            <Text style={styles.primaryText}>
              {busy ? "Updating..." : round.mode === "planning" ? "I'm in" : "Claim spot"}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.button, styles.secondaryButton, busy && styles.disabledButton]}
            onPress={() => void rsvp("decline")}
            disabled={busy}
          >
            <Text style={styles.secondaryText}>Decline</Text>
          </Pressable>
        </View>
      ) : null}
      {showUnclaimAction ? (
        <View style={styles.actions}>
          <Pressable
            style={[styles.button, styles.secondaryButton, busy && styles.disabledButton]}
            onPress={() => void rsvp("decline")}
            disabled={busy}
          >
            <Text style={styles.secondaryText}>{busy ? "Updating..." : "Unclaim spot"}</Text>
          </Pressable>
        </View>
      ) : null}
      {round.isHost ? (
        <View style={styles.hostActionsRow}>
          <Pressable
            style={[styles.button, styles.hostEditButton]}
            onPress={() =>
              router.push({
                pathname: "/round/[token]/edit",
                params: { token: round.inviteToken },
              })
            }
          >
            <Text style={styles.hostEditText}>Edit round</Text>
          </Pressable>
          <Pressable
            style={[styles.button, styles.hostDeleteButton, deleteBusy && styles.disabledButton]}
            onPress={() => setDeleteConfirmOpen(true)}
            disabled={deleteBusy}
          >
            <Text style={styles.hostDeleteText}>
              {deleteBusy ? "Deleting..." : "Delete round"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <DatePickerModal
        visible={calendarOpen}
        title="Select tee date"
        selectedDate={finalizeTeeDate}
        onSelectDate={onSelectCalendarDay}
        onClose={() => setCalendarOpen(false)}
        minimumDate={new Date()}
      />

      <Modal visible={deleteConfirmOpen} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setDeleteConfirmOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.modalTitle}>Delete round?</Text>
            <Text style={styles.listMeta}>
              This will permanently remove the round and all RSVP activity.
            </Text>
            <View style={styles.inlineRow}>
              <Pressable
                style={[styles.button, styles.secondaryButton]}
                onPress={() => setDeleteConfirmOpen(false)}
              >
                <Text style={styles.secondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.button, styles.hostDeleteButton, deleteBusy && styles.disabledButton]}
                onPress={() => {
                  setDeleteConfirmOpen(false);
                  void deleteRound();
                }}
                disabled={deleteBusy}
              >
                <Text style={styles.hostDeleteText}>
                  {deleteBusy ? "Deleting..." : "Delete"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <TimePickerModal
        visible={timePickerOpen}
        title="Select tee time"
        value={finalizeTeeTimeValue}
        onChange={setFinalizeTeeTimeValue}
        onClose={() => setTimePickerOpen(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 8, paddingBottom: 32 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { width: "100%", height: 180, borderRadius: 16, backgroundColor: "#dfe6df" },
  title: { fontSize: 28, fontWeight: "700", color: colors.text, marginTop: 8 },
  planningHeaderCard: {
    borderRadius: 16,
    backgroundColor: "#f5faf6",
    borderWidth: 1,
    borderColor: "#d4e8d8",
    padding: 14,
    gap: 2,
  },
  planningLabel: {
    color: colors.fairway,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  planningDate: { color: colors.text, fontSize: 30, fontWeight: "800", lineHeight: 36 },
  planningTime: { color: colors.muted, fontSize: 15, fontWeight: "600" },
  whenBlock: { gap: 2, marginTop: 2 },
  whenDate: { color: colors.text, fontWeight: "700", fontSize: 18 },
  whenTime: { color: colors.muted, fontWeight: "600" },
  meta: { color: colors.muted },
  claimedRow: { marginTop: 10, gap: 6 },
  claimedLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  claimedThumbs: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  claimedThumb: { width: 32, height: 32, borderRadius: 999 },
  emptyThumb: {
    backgroundColor: "#ece8e1",
    borderWidth: 1,
    borderColor: colors.border,
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
  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  button: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  inviteCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 12,
    gap: 8,
    marginTop: 8,
  },
  selectedRow: {
    backgroundColor: colors.fairwaySoft,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectedText: { color: colors.text },
  removeText: { color: colors.danger, fontWeight: "600" },
  primaryButton: { backgroundColor: colors.fairway },
  secondaryButton: { backgroundColor: "#ece8e1" },
  hostActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  hostEditButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hostDeleteButton: {
    backgroundColor: "#fee4e2",
    borderWidth: 1,
    borderColor: "#fbc6c2",
  },
  disabledButton: { opacity: 0.5 },
  primaryText: { color: "#fff", fontWeight: "700" },
  secondaryText: { color: colors.text, fontWeight: "700" },
  hostEditText: { color: colors.text, fontWeight: "700" },
  hostDeleteText: { color: colors.danger, fontWeight: "700" },
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
  finalizeCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 12,
    gap: 8,
    marginTop: 6,
  },
  finalizeTitle: { fontWeight: "700", color: colors.text, fontSize: 16 },
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
  inputClearBtn: {
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.2)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  modalTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
});
