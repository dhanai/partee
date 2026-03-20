import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiDelete, apiGet, apiPost, toAbsoluteUrl } from "../../lib/api";
import { colors } from "../../lib/theme";
import { RoundDetails } from "../../types/round";

type RoundResponse = { round: RoundDetails };
type CourseResult = { id: string; name: string; address: string };

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
  const [round, setRound] = useState<RoundDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [finalizeQuery, setFinalizeQuery] = useState("");
  const [finalizeResults, setFinalizeResults] = useState<CourseResult[]>([]);
  const [finalizeCourse, setFinalizeCourse] = useState<CourseResult | null>(null);
  const [finalizeTeeTime, setFinalizeTeeTime] = useState("");
  const [finalizeBusy, setFinalizeBusy] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  useEffect(() => {
    async function loadRound() {
      try {
        setError(null);
        const authToken = await getToken();
        const data = await apiGet<RoundResponse>(`/api/rounds/${token}`, authToken);
        setRound(data.round);
        if (data.round.mode === "planning") {
          setFinalizeTeeTime(new Date(data.round.targetDate).toISOString().slice(0, 16));
        }
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Unable to load.");
      } finally {
        setLoading(false);
      }
    }

    if (token) {
      void loadRound();
    }
  }, [token, getToken]);

  async function searchFinalizeCourses() {
    if (finalizeQuery.trim().length < 2) {
      setFinalizeResults([]);
      return;
    }
    try {
      const authToken = await getToken();
      const data = await apiPost<{ courses: CourseResult[] }>(
        "/api/courses/search",
        { query: finalizeQuery },
        authToken,
      );
      setFinalizeResults(data.courses);
    } catch (searchError) {
      setFinalizeError(
        searchError instanceof Error ? searchError.message : "Course search failed.",
      );
    }
  }

  async function finalizeRound() {
    if (!token) return;
    if (!finalizeCourse) {
      setFinalizeError("Select a course.");
      return;
    }
    if (!finalizeTeeTime) {
      setFinalizeError("Enter tee time.");
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
          teeTime: new Date(finalizeTeeTime).toISOString(),
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
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const authToken = await getToken();
      await apiPost<{ status?: string }>(
        `/api/rounds/${token}/join`,
        { action },
        authToken,
      );
      setMessage(action === "claim" ? "RSVP submitted." : "Declined.");
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

  function confirmDelete() {
    Alert.alert(
      "Delete round?",
      "This will permanently remove the round and all RSVP activity.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void deleteRound();
          },
        },
      ],
    );
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
      <View style={styles.spotStatsRow}>
        <View style={[styles.spotStatCard, styles.spotFilledCard]}>
          <Text style={styles.spotStatValue}>{round.confirmedCount}</Text>
          <Text style={styles.spotStatLabel}>Filled</Text>
        </View>
        <View style={[styles.spotStatCard, styles.spotOpenCard]}>
          <Text style={styles.spotStatValue}>{round.spotsRemaining}</Text>
          <Text style={styles.spotStatLabel}>Open</Text>
        </View>
        <View style={[styles.spotStatCard, styles.spotTotalCard]}>
          <Text style={styles.spotStatValue}>{round.totalSpots}</Text>
          <Text style={styles.spotStatLabel}>Total</Text>
        </View>
      </View>
      {round.confirmedPlayers.length > 0 ? (
        <View style={styles.claimedRow}>
          <Text style={styles.claimedLabel}>Claimed</Text>
          <View style={styles.claimedThumbs}>
            {round.confirmedPlayers.map((player) =>
              player.avatar ? (
                <Image
                  key={player.id}
                  source={{ uri: toAbsoluteUrl(player.avatar) }}
                  style={styles.claimedThumb}
                />
              ) : (
                <View key={player.id} style={[styles.claimedThumb, styles.hostAvatarFallback]}>
                  <Text style={styles.hostInitial}>
                    {player.name.trim().charAt(0).toUpperCase() || "?"}
                  </Text>
                </View>
              ),
            )}
          </View>
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {message ? <Text style={styles.successText}>{message}</Text> : null}

      {round.isHost && round.mode === "planning" ? (
        <View style={styles.finalizeCard}>
          <Text style={styles.finalizeTitle}>Finalize details</Text>
          <Text style={styles.meta}>Pick course and tee time for your group.</Text>

          <View style={styles.inlineRow}>
            <TextInput
              value={finalizeQuery}
              onChangeText={setFinalizeQuery}
              placeholder="Search golf course..."
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.flex1]}
            />
            <Pressable style={styles.searchBtn} onPress={() => void searchFinalizeCourses()}>
              <Text style={styles.searchBtnText}>Search</Text>
            </Pressable>
          </View>
          {finalizeResults.map((course) => (
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

          <TextInput
            value={finalizeTeeTime}
            onChangeText={setFinalizeTeeTime}
            placeholder="YYYY-MM-DDTHH:mm"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
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

      {!round.isHost ? (
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
      {round.isHost ? (
        <Pressable
          style={styles.editButton}
          onPress={() =>
            router.push({
              pathname: "/round/[token]/edit",
              params: { token: round.inviteToken },
            })
          }
        >
          <Text style={styles.editText}>Edit round</Text>
        </Pressable>
      ) : null}
      {round.isHost ? (
        <Pressable
          style={[styles.deleteButton, deleteBusy && styles.disabledButton]}
          onPress={confirmDelete}
          disabled={deleteBusy}
        >
          <Text style={styles.deleteText}>
            {deleteBusy ? "Deleting..." : "Delete round"}
          </Text>
        </Pressable>
      ) : null}
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
  spotStatsRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  spotStatCard: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
  },
  spotFilledCard: { backgroundColor: colors.fairwaySoft, borderColor: "#cfe4d4" },
  spotOpenCard: { backgroundColor: "#f2f6fb", borderColor: "#d8e4f1" },
  spotTotalCard: { backgroundColor: "#f7f1e8", borderColor: "#eadfcd" },
  spotStatValue: { color: colors.text, fontSize: 24, fontWeight: "800" },
  spotStatLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  claimedRow: { marginTop: 6, gap: 6 },
  claimedLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  claimedThumbs: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  claimedThumb: { width: 32, height: 32, borderRadius: 999 },
  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  button: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  primaryButton: { backgroundColor: colors.fairway },
  secondaryButton: { backgroundColor: "#ece8e1" },
  editButton: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 16,
    backgroundColor: "#ece8e1",
    borderWidth: 1,
    borderColor: colors.border,
  },
  deleteButton: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 10,
    backgroundColor: "#fee4e2",
    borderWidth: 1,
    borderColor: "#fbc6c2",
  },
  disabledButton: { opacity: 0.5 },
  primaryText: { color: "#fff", fontWeight: "700" },
  secondaryText: { color: colors.text, fontWeight: "700" },
  editText: { color: colors.text, fontWeight: "700" },
  deleteText: { color: colors.danger, fontWeight: "700" },
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
  inlineRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: {
    backgroundColor: "#f1efea",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    color: colors.text,
  },
  flex1: { flex: 1 },
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
