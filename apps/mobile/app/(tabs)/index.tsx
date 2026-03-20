import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { apiGet, toAbsoluteUrl } from "../../lib/api";
import { colors } from "../../lib/theme";
import { DiscoverRound } from "../../types/round";

type DiscoverResponse = {
  rounds: DiscoverRound[];
};

export default function DiscoverScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const [rounds, setRounds] = useState<DiscoverRound[]>([]);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [rangeModalOpen, setRangeModalOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRightContainerStyle: {
        paddingRight: 12,
      },
      headerRight: () => (
        <Pressable
          style={styles.headerCalendarBtn}
          onPress={() => setRangeModalOpen(true)}
          accessibilityLabel="Open date range picker"
        >
          <Ionicons name="calendar-outline" size={18} color={colors.fairway} />
        </Pressable>
      ),
    });
  }, [navigation]);

  const loadRounds = useCallback(async () => {
    try {
      setError(null);
      const authToken = await getTokenRef.current();
      const data = await apiGet<DiscoverResponse>(
        "/api/rounds/discover",
        authToken,
      );
      setRounds(data.rounds);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unable to load.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadRounds();
    }, [loadRounds]),
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.fairway} />
      </View>
    );
  }

  const filteredRounds = rounds.filter((round) => {
    const when = new Date(round.effectiveDate);
    if (startDate && when < startDate) return false;
    if (endDate) {
      const endBoundary = new Date(endDate);
      endBoundary.setHours(23, 59, 59, 999);
      if (when > endBoundary) return false;
    }
    return true;
  });

  function formatDateShort(date: Date | null) {
    return date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Any";
  }

  function formatPlanningWindow(
    window: "morning" | "afternoon" | "twilight" | null | undefined,
  ) {
    if (!window) return "Time TBD";
    return window.charAt(0).toUpperCase() + window.slice(1);
  }

  function isSameDay(a: Date, b: Date) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function isInSelectedRange(day: Date) {
    if (!startDate || !endDate) return false;
    const d = startOfDay(day).getTime();
    return d >= startOfDay(startDate).getTime() && d <= startOfDay(endDate).getTime();
  }

  function onSelectDay(day: Date) {
    const picked = startOfDay(day);
    if (!startDate || (startDate && endDate)) {
      setStartDate(picked);
      setEndDate(null);
      return;
    }
    if (picked.getTime() < startOfDay(startDate).getTime()) {
      setStartDate(picked);
      return;
    }
    setEndDate(picked);
  }

  const monthLabel = calendarMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const firstWeekday = new Date(
    calendarMonth.getFullYear(),
    calendarMonth.getMonth(),
    1,
  ).getDay();
  const daysInMonth = new Date(
    calendarMonth.getFullYear(),
    calendarMonth.getMonth() + 1,
    0,
  ).getDate();
  const dayCells = [
    ...Array.from({ length: firstWeekday }).map(() => null),
    ...Array.from({ length: daysInMonth }).map((_, i) => i + 1),
  ];
  while (dayCells.length % 7 !== 0) dayCells.push(null);

  const selectedLabel =
    startDate && endDate
      ? `${formatDateShort(startDate)} - ${formatDateShort(endDate)}`
      : startDate
        ? `${formatDateShort(startDate)}`
        : null;

  function shiftMonth(delta: number) {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => {
          setRefreshing(true);
          void loadRounds();
        }} />
      }
    >
      <Text style={styles.heading}>Discover</Text>
      <Text style={styles.subheading}>Open rounds looking for players.</Text>
      {selectedLabel ? (
        <View style={styles.rangeRow}>
          <Text style={styles.rangeText}>{selectedLabel}</Text>
        </View>
      ) : null}
      {(startDate || endDate) && (
        <Pressable
          onPress={() => {
            setStartDate(null);
            setEndDate(null);
          }}
        >
          <Text style={styles.clearText}>Clear date range</Text>
        </Pressable>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {filteredRounds.map((round) => (
        <Pressable
          key={round.id}
          style={[styles.card, round.mode === "planning" && styles.planningCard]}
          onPress={() =>
            router.push({
              pathname: "/round/[token]",
              params: { token: round.inviteToken },
            })
          }
        >
          {round.mode === "scheduled" ? (
            <>
              <Image source={{ uri: toAbsoluteUrl(round.imageUrl) }} style={styles.cardImage} />
              <View style={styles.topRow}>
                <Text style={styles.cardTitle}>{round.courseName}</Text>
                <Text style={styles.badgeMuted}>
                  {round.joinPolicy === "instant" ? "Instant" : "Approval"}
                </Text>
              </View>
              <Text style={styles.cardMeta}>
                {new Date(round.effectiveDate).toLocaleDateString()}{" "}
                {round.teeTime
                  ? `at ${new Date(round.teeTime).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}`
                  : "• time TBD"}
              </Text>
              <View style={styles.badgeRow}>
                <Text style={styles.badge}>
                  {round.totalSpots} spots • {round.spotsRemaining} left
                </Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.topRow}>
                <Text style={styles.planDate}>
                  {new Date(round.effectiveDate).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </Text>
                <Text style={styles.badgeMuted}>Planning round</Text>
              </View>
              <Text style={styles.cardMeta}>{formatPlanningWindow(round.preferredTimeWindow)}</Text>
              <View style={styles.badgeRow}>
                <Text style={styles.badge}>
                  {round.totalSpots} spots • {round.spotsRemaining} left
                </Text>
              </View>
            </>
          )}
          <View style={styles.hostRow}>
            {round.hostAvatar ? (
              <Image source={{ uri: toAbsoluteUrl(round.hostAvatar) }} style={styles.hostAvatar} />
            ) : (
              <View style={[styles.hostAvatar, styles.hostAvatarFallback]}>
                <Text style={styles.hostInitial}>
                  {round.hostName.trim().charAt(0).toUpperCase() || "?"}
                </Text>
              </View>
            )}
            <Text style={styles.hostLabel}>Hosted by {round.hostName}</Text>
          </View>
        </Pressable>
      ))}

      <Modal visible={rangeModalOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Date range</Text>
            <View style={styles.monthNavRow}>
              <Pressable style={styles.monthNavBtn} onPress={() => shiftMonth(-1)}>
                <Ionicons name="chevron-back" size={16} color={colors.fairway} />
              </Pressable>
              <Text style={styles.monthLabel}>{monthLabel}</Text>
              <Pressable style={styles.monthNavBtn} onPress={() => shiftMonth(1)}>
                <Ionicons name="chevron-forward" size={16} color={colors.fairway} />
              </Pressable>
            </View>
            <View style={styles.weekHeader}>
              {["S", "M", "T", "W", "T", "F", "S"].map((d, idx) => (
                <Text key={`${d}-${idx}`} style={styles.weekHeaderText}>
                  {d}
                </Text>
              ))}
            </View>
            <View style={styles.calendarGrid}>
              {dayCells.map((dayNum, idx) => {
                if (dayNum === null) {
                  return <View key={`empty-${idx}`} style={styles.dayCell} />;
                }
                const dayDate = new Date(
                  calendarMonth.getFullYear(),
                  calendarMonth.getMonth(),
                  dayNum,
                );
                const isStart = startDate ? isSameDay(dayDate, startDate) : false;
                const isEnd = endDate ? isSameDay(dayDate, endDate) : false;
                const inRange = isInSelectedRange(dayDate);
                return (
                  <Pressable
                    key={`day-${dayNum}`}
                    style={[
                      styles.dayCell,
                      inRange && styles.dayInRange,
                      (isStart || isEnd) && styles.daySelected,
                    ]}
                    onPress={() => onSelectDay(dayDate)}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        (isStart || isEnd) && styles.dayTextSelected,
                      ]}
                    >
                      {dayNum}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              style={styles.modalDoneBtn}
              onPress={() => {
                setRangeModalOpen(false);
              }}
            >
              <Text style={styles.modalDoneText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  heading: { fontSize: 28, fontWeight: "700", color: colors.text },
  subheading: { color: colors.muted, marginBottom: 8 },
  errorText: {
    color: colors.danger,
    backgroundColor: "#fee4e2",
    padding: 10,
    borderRadius: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 11,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  planningCard: {
    borderColor: "#a8d4b2",
    borderStyle: "dashed",
    backgroundColor: "#fbfffc",
  },
  cardImage: { width: "100%", height: 132, borderRadius: 12, backgroundColor: "#dfe6df" },
  topRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  cardTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
  planDate: { fontSize: 20, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  cardMeta: { color: colors.muted },
  badgeRow: { flexDirection: "row", justifyContent: "space-between" },
  badge: {
    backgroundColor: colors.fairwaySoft,
    color: colors.fairway,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    fontWeight: "600",
    overflow: "hidden",
  },
  hostRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  hostAvatar: { width: 28, height: 28, borderRadius: 999 },
  hostAvatarFallback: {
    backgroundColor: "#f1efea",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  hostInitial: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  hostLabel: { color: colors.text, fontWeight: "600", fontSize: 13 },
  badgeMuted: {
    backgroundColor: "#f1efea",
    color: colors.muted,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
  },
  rangeRow: {
    backgroundColor: "#f1efea",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  rangeText: {
    color: colors.text,
    fontWeight: "600",
  },
  headerCalendarBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  clearText: { color: colors.fairway, fontWeight: "600", marginTop: -4 },
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
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  monthNavRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  monthNavBtn: {
    width: 30,
    height: 30,
    borderRadius: 12,
    backgroundColor: "#f3f1ed",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  monthLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  weekHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  weekHeaderText: {
    width: `${100 / 7}%`,
    textAlign: "center",
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  dayInRange: {
    backgroundColor: colors.fairwaySoft,
  },
  daySelected: {
    backgroundColor: colors.fairway,
  },
  dayText: {
    color: colors.text,
    fontWeight: "600",
  },
  dayTextSelected: {
    color: "#fff",
  },
  modalDoneBtn: {
    backgroundColor: colors.fairway,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
  },
  modalDoneText: {
    color: "#fff",
    fontWeight: "700",
  },
});
