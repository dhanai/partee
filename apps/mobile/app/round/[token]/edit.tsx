import { useLocalSearchParams } from "expo-router";
import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  apiGet,
  apiPatch,
  apiPost,
} from "../../../lib/api";
import { emitRoundListsShouldRefresh } from "../../../lib/round-lists-refresh";
import { colors } from "../../../lib/theme";
import { RoundDetails } from "../../../types/round";
import { DatePickerModal } from "../../../components/date-picker-modal";
import { PlanningTimeWindowChips } from "../../../components/planning-time-window-chips";
import { TimePickerModal } from "../../../components/time-picker-modal";

type RoundResponse = { round: RoundDetails };
type CourseResult = { id: string; name: string; address: string };
type LocationResult = { label: string; city: string; state: string };

function useDebounce(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export default function EditRoundScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const navigation = useNavigation();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const initialSnapshotRef = useRef<string | null>(null);
  const baselineCapturedRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentSnapshotRef = useRef("");
  const loadedRoundMetaRef = useRef<{ id: string } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [snapshotReady, setSnapshotReady] = useState(false);

  const [planningMode, setPlanningMode] = useState(true);
  const [preferredTimeWindow, setPreferredTimeWindow] = useState<
    "morning" | "afternoon" | "twilight"
  >("morning");
  const [planningLocation, setPlanningLocation] = useState("");
  const [planningLocationIsValidated, setPlanningLocationIsValidated] = useState(true);
  const [locationResults, setLocationResults] = useState<LocationResult[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [showLocationResults, setShowLocationResults] = useState(false);
  const [targetDate, setTargetDate] = useState<Date | null>(null);
  const [teeDate, setTeeDate] = useState<Date | null>(null);
  const [teeTimeValue, setTeeTimeValue] = useState<Date>(() => {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    return now;
  });
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarTarget, setCalendarTarget] = useState<"targetDate" | "teeDate">(
    "targetDate",
  );

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CourseResult[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CourseResult | null>(null);
  const [showCourseResults, setShowCourseResults] = useState(false);
  const debouncedCourseQuery = useDebounce(query, 320);
  const debouncedPlanningLocation = useDebounce(planningLocation, 320);

  const [totalSpots, setTotalSpots] = useState(4);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [joinPolicy, setJoinPolicy] = useState<"instant" | "approval">("instant");
  const [customImageUrl, setCustomImageUrl] = useState<string | null>(null);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    async function loadRound() {
      if (!token) return;
      baselineCapturedRef.current = false;
      setSnapshotReady(false);
      loadedRoundMetaRef.current = null;
      try {
        setSaveNote(null);
        setError(null);
        const authToken = await getTokenRef.current();
        const data = await apiGet<RoundResponse>(`/api/rounds/${token}`, authToken);
        const round = data.round;
        if (!round.isHost) {
          setError("Only the host can edit this round.");
          return;
        }

        loadedRoundMetaRef.current = { id: round.id };
        setPlanningMode(round.mode === "planning");
        setPreferredTimeWindow(round.preferredTimeWindow ?? "morning");
        setTotalSpots(round.totalSpots);
        setVisibility(round.visibility);
        setJoinPolicy(round.joinPolicy);
        setCustomImageUrl(round.customImageUrl ?? null);

        if (round.mode === "planning") {
          setPlanningLocation(round.planningLocation ?? "");
          setPlanningLocationIsValidated(Boolean(round.planningLocation?.trim()));
          const d = new Date(round.targetDate);
          d.setHours(0, 0, 0, 0);
          setTargetDate(d);
        } else {
          if (round.courseId) {
            setSelectedCourse({
              id: round.courseId,
              name: round.courseName,
              address: "",
            });
            setQuery(round.courseName);
          }
          if (round.teeTime) {
            const tee = new Date(round.teeTime);
            const d = new Date(tee);
            d.setHours(0, 0, 0, 0);
            setTeeDate(d);
            setTeeTimeValue(tee);
          }
        }
        setSnapshotReady(true);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load round.");
      } finally {
        setLoading(false);
      }
    }

    void loadRound();
  }, [token]);

  useEffect(() => {
    if (planningMode) return;
    if (selectedCourse && debouncedCourseQuery.trim() === selectedCourse.name) return;
    let active = true;

    async function runCourseSearch() {
      const q = debouncedCourseQuery.trim();
      if (q.length < 2) {
        if (active) {
          setResults([]);
          setShowCourseResults(false);
        }
        return;
      }
      setLoadingCourses(true);
      try {
        const authToken = await getTokenRef.current();
        const data = await apiPost<{ courses: CourseResult[] }>(
          "/api/courses/search",
          { query: q },
          authToken,
        );
        if (!active) return;
        setResults(data.courses);
        setShowCourseResults(true);
      } catch (searchError) {
        if (!active) return;
        setError(searchError instanceof Error ? searchError.message : "Course search failed.");
      } finally {
        if (active) setLoadingCourses(false);
      }
    }

    void runCourseSearch();
    return () => {
      active = false;
    };
  }, [debouncedCourseQuery, planningMode, selectedCourse]);

  useEffect(() => {
    let active = true;
    async function runLocationSearch() {
      if (!planningMode) return;
      if (planningLocationIsValidated) {
        if (active) {
          setLocationResults([]);
          setShowLocationResults(false);
          setLoadingLocations(false);
        }
        return;
      }
      const q = debouncedPlanningLocation.trim();
      if (q.length < 2) {
        if (active) {
          setLocationResults([]);
          setShowLocationResults(false);
        }
        return;
      }
      setLoadingLocations(true);
      try {
        const authToken = await getTokenRef.current();
        const data = await apiPost<{ locations: LocationResult[] }>(
          "/api/locations/search",
          { query: q },
          authToken,
        );
        if (!active) return;
        setLocationResults(data.locations);
        setShowLocationResults(true);
      } catch {
        if (!active) return;
      } finally {
        if (active) setLoadingLocations(false);
      }
    }

    void runLocationSearch();
    return () => {
      active = false;
    };
  }, [debouncedPlanningLocation, planningMode, planningLocationIsValidated]);

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (planningMode) {
      return Boolean(
        targetDate &&
          planningLocation.trim().length >= 2 &&
          planningLocationIsValidated,
      );
    }
    return Boolean(selectedCourse && teeDate);
  }, [
    planningMode,
    targetDate,
    planningLocation,
    planningLocationIsValidated,
    selectedCourse,
    teeDate,
    submitting,
  ]);

  const currentSnapshot = useMemo(
    () =>
      JSON.stringify({
        planningMode,
        preferredTimeWindow,
        planningLocation: planningLocation.trim(),
        targetDate: targetDate ? startOfDay(targetDate).toISOString() : null,
        teeDate:
          !planningMode && teeDate ? startOfDay(teeDate).toISOString() : null,
        ...(!planningMode
          ? { teeTime: `${teeTimeValue.getHours()}:${teeTimeValue.getMinutes()}` }
          : {}),
        selectedCourseId: selectedCourse?.id ?? null,
        totalSpots,
        visibility,
        joinPolicy,
        customImageUrl: customImageUrl ?? null,
      }),
    [
      planningMode,
      preferredTimeWindow,
      planningLocation,
      targetDate,
      teeDate,
      teeTimeValue,
      selectedCourse,
      totalSpots,
      visibility,
      joinPolicy,
      customImageUrl,
    ],
  );
  currentSnapshotRef.current = currentSnapshot;

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

  function openCalendar(target: "targetDate" | "teeDate") {
    setCalendarTarget(target);
    setCalendarOpen(true);
  }

  function onSelectCalendarDay(day: Date) {
    const picked = startOfDay(day);
    if (calendarTarget === "targetDate") {
      setTargetDate(picked);
    } else {
      setTeeDate(picked);
    }
  }

  function minimumDate() {
    const min = new Date();
    min.setHours(0, 0, 0, 0);
    return min;
  }

  const submit = useCallback(async () => {
    if (!token || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    setSaveNote(null);
    try {
      const authToken = await getTokenRef.current();
      let teeTimeIso: string | undefined;
      if (!planningMode && teeDate) {
        const combined = new Date(teeDate);
        combined.setHours(teeTimeValue.getHours(), teeTimeValue.getMinutes(), 0, 0);
        teeTimeIso = combined.toISOString();
      }

      const planningTargetDateIso =
        planningMode && targetDate
          ? (() => {
              const noon = new Date(targetDate);
              noon.setHours(12, 0, 0, 0);
              return noon.toISOString();
            })()
          : undefined;

      await apiPatch<{ ok: boolean }>(
        `/api/rounds/${token}`,
        {
          planningMode,
          preferredTimeWindow: planningMode ? preferredTimeWindow : undefined,
          planningLocation: planningMode ? planningLocation.trim() : undefined,
          courseId: planningMode ? undefined : selectedCourse?.id,
          teeTime: teeTimeIso,
          targetDate: planningTargetDateIso,
          totalSpots,
          visibility,
          joinPolicy,
          customImageUrl,
        },
        authToken,
      );

      initialSnapshotRef.current = currentSnapshot;
      setSaveNote("Saved");

      const meta = loadedRoundMetaRef.current;
      if (meta && token) {
        const teeTimeIso =
          !planningMode && teeDate
            ? (() => {
                const c = new Date(teeDate);
                c.setHours(teeTimeValue.getHours(), teeTimeValue.getMinutes(), 0, 0);
                return c.toISOString();
              })()
            : null;
        const targetDateIso =
          planningMode && targetDate
            ? (() => {
                const n = new Date(targetDate);
                n.setHours(12, 0, 0, 0);
                return n.toISOString();
              })()
            : teeDate
              ? new Date(
                  teeDate.getFullYear(),
                  teeDate.getMonth(),
                  teeDate.getDate(),
                ).toISOString()
              : "";
        const effectiveDate = teeTimeIso ?? targetDateIso;
        emitRoundListsShouldRefresh({
          optimistic: {
            roundId: meta.id,
            inviteToken: token,
            mode: planningMode ? "planning" : "scheduled",
            preferredTimeWindow: planningMode ? preferredTimeWindow : null,
            planningLocation: planningMode ? planningLocation.trim() : null,
            courseName: planningMode ? "" : (selectedCourse?.name ?? ""),
            courseId: planningMode ? null : (selectedCourse?.id ?? null),
            teeTime: teeTimeIso,
            targetDate: targetDateIso,
            effectiveDate,
            totalSpots,
            visibility,
            joinPolicy,
            customImageUrl: customImageUrl ?? null,
          },
        });
      } else {
        emitRoundListsShouldRefresh();
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Update failed.");
    } finally {
      setSubmitting(false);
    }
  }, [
    token,
    canSubmit,
    planningMode,
    teeDate,
    teeTimeValue,
    targetDate,
    preferredTimeWindow,
    planningLocation,
    selectedCourse,
    totalSpots,
    visibility,
    joinPolicy,
    customImageUrl,
    currentSnapshot,
  ]);

  /**
   * Capture baseline after hydrate: defer one macrotask so other effects
   * (e.g. planning mode clearing course fields) have applied first.
   */
  useEffect(() => {
    if (!snapshotReady || loading) return;
    if (baselineCapturedRef.current) return;
    const id = setTimeout(() => {
      baselineCapturedRef.current = true;
      initialSnapshotRef.current = currentSnapshotRef.current;
    }, 0);
    return () => clearTimeout(id);
  }, [snapshotReady, loading]);

  useLayoutEffect(() => {
    const show = submitting || saveNote != null;
    const label = submitting ? "Saving…" : (saveNote ?? "");
    const pill = (
      <View style={styles.headerSavePill}>
        <Text style={styles.headerSavePillText} numberOfLines={1}>
          {label}
        </Text>
      </View>
    );

    if (Platform.OS === "ios") {
      navigation.setOptions({
        headerRight: undefined,
        headerRightContainerStyle: { paddingRight: 6 },
        unstable_headerRightItems: show
          ? () => [
              {
                type: "custom" as const,
                element: pill,
                hidesSharedBackground: true,
              },
            ]
          : () => [],
      });
    } else {
      navigation.setOptions({
        unstable_headerRightItems: undefined,
        headerRightContainerStyle: { paddingRight: 10, justifyContent: "center" },
        headerRight: () => (show ? pill : null),
      });
    }
  }, [navigation, submitting, saveNote]);

  useEffect(() => {
    if (!snapshotReady || loading) return;
    if (!baselineCapturedRef.current) return;
    if (!canSubmit || submitting) return;
    if (initialSnapshotRef.current === currentSnapshot) return;
    setSaveNote(null);
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      void submit();
    }, 700);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [snapshotReady, loading, canSubmit, submitting, currentSnapshot, submit]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.fairway} />
      </View>
    );
  }

  const isPlanningRound = planningMode;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>
        {isPlanningRound ? "Planning Round" : "Scheduled Tee Time"}
      </Text>
      <Text style={styles.copy}>
        {isPlanningRound
          ? "Find players first. Lock details later. Changes save automatically."
          : "Set it up. Blast invites. Tee off. Changes save automatically."}
      </Text>

      <View style={styles.card}>
        {isPlanningRound ? (
          <>
            <Text style={styles.label}>Target date</Text>
            <Pressable style={styles.datePickerBtn} onPress={() => openCalendar("targetDate")}>
              <Text style={[styles.datePickerText, !targetDate && styles.datePickerPlaceholder]}>
                {formatDateLabel(targetDate)}
              </Text>
              <Ionicons name="calendar-outline" size={18} color={colors.fairway} />
            </Pressable>
            <Text style={styles.label}>Preferred time</Text>
            <PlanningTimeWindowChips
              value={preferredTimeWindow}
              onChange={setPreferredTimeWindow}
            />
            <Text style={styles.label}>Location</Text>
            <View style={styles.inputRow}>
              <TextInput
                value={planningLocation}
                onChangeText={(value) => {
                  setPlanningLocation(value);
                  setPlanningLocationIsValidated(false);
                }}
                onFocus={() => locationResults.length > 0 && setShowLocationResults(true)}
                placeholder="City, State"
                placeholderTextColor={colors.muted}
                style={[styles.input, styles.inputWithAccessory]}
              />
              {loadingLocations &&
              !planningLocationIsValidated &&
              planningLocation.trim().length >= 2 ? (
                <View style={styles.inputAccessory}>
                  <ActivityIndicator size="small" color={colors.muted} />
                </View>
              ) : null}
              {planningLocationIsValidated && planningLocation.trim().length > 0 ? (
                <Pressable
                  style={styles.inputAccessory}
                  onPress={() => {
                    setPlanningLocation("");
                    setPlanningLocationIsValidated(false);
                    setLocationResults([]);
                    setShowLocationResults(false);
                  }}
                >
                  <Ionicons name="close" size={15} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
            {showLocationResults &&
              locationResults.map((item) => (
                <Pressable
                  key={item.label}
                  style={styles.listRow}
                  onPress={() => {
                    setPlanningLocation(item.label);
                    setPlanningLocationIsValidated(true);
                    setLocationResults([]);
                    setShowLocationResults(false);
                  }}
                >
                  <Text style={styles.listTitle}>{item.label}</Text>
                </Pressable>
              ))}
            {!planningLocationIsValidated && planningLocation.trim().length > 0 ? (
              <Text style={styles.loadingHint}>Select a suggested city/state.</Text>
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.label}>Course search</Text>
            <View style={styles.inputRow}>
              <TextInput
                value={query}
                onChangeText={(value) => {
                  setQuery(value);
                  if (selectedCourse && value !== selectedCourse.name) {
                    setSelectedCourse(null);
                  }
                }}
                onFocus={() => results.length > 0 && setShowCourseResults(true)}
                placeholder="Search golf courses..."
                placeholderTextColor={colors.muted}
                style={[styles.input, styles.inputWithAccessory]}
              />
              {loadingCourses && !selectedCourse && query.trim().length >= 2 ? (
                <View style={styles.inputAccessory}>
                  <ActivityIndicator size="small" color={colors.muted} />
                </View>
              ) : null}
              {selectedCourse ? (
                <Pressable
                  style={styles.inputAccessory}
                  onPress={() => {
                    setSelectedCourse(null);
                    setQuery("");
                    setResults([]);
                    setShowCourseResults(false);
                  }}
                >
                  <Ionicons name="close" size={15} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
            {showCourseResults &&
              results.map((course) => (
                <Pressable
                  key={course.id}
                  style={styles.listRow}
                  onPress={() => {
                    setSelectedCourse(course);
                    setQuery(course.name);
                    setResults([]);
                    setShowCourseResults(false);
                  }}
                >
                  <Text style={styles.listTitle}>{course.name}</Text>
                  <Text style={styles.listMeta}>{course.address}</Text>
                </Pressable>
              ))}
            <Text style={styles.label}>Tee time</Text>
            <View style={styles.row}>
              <Pressable
                style={[styles.datePickerBtn, styles.flex1]}
                onPress={() => openCalendar("teeDate")}
              >
                <Text style={[styles.datePickerText, !teeDate && styles.datePickerPlaceholder]}>
                  {formatDateLabel(teeDate)}
                </Text>
                <Ionicons name="calendar-outline" size={18} color={colors.fairway} />
              </Pressable>
              <Pressable
                style={[styles.datePickerBtn, styles.flex1]}
                onPress={() => setTimePickerOpen(true)}
              >
                <Text style={styles.datePickerText}>{formatTimeLabel(teeTimeValue)}</Text>
                <Ionicons name="time-outline" size={18} color={colors.fairway} />
              </Pressable>
            </View>
          </>
        )}

        <Text style={styles.label}>Visibility</Text>
        <View style={styles.row}>
          <Pressable
            style={[styles.pill, visibility === "private" && styles.pillActive]}
            onPress={() => setVisibility("private")}
          >
            <Text style={[styles.pillText, visibility === "private" && styles.pillTextActive]}>
              Invite only
            </Text>
          </Pressable>
          <Pressable
            style={[styles.pill, visibility === "public" && styles.pillActive]}
            onPress={() => setVisibility("public")}
          >
            <Text style={[styles.pillText, visibility === "public" && styles.pillTextActive]}>
              Public
            </Text>
          </Pressable>
        </View>

        <Text style={styles.label}>Spots</Text>
        <View style={styles.row}>
          {[2, 3, 4].map((n) => (
            <Pressable
              key={n}
              style={[styles.pill, totalSpots === n && styles.pillActive]}
              onPress={() => setTotalSpots(n)}
            >
              <Text style={[styles.pillText, totalSpots === n && styles.pillTextActive]}>
                {n}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Join policy</Text>
        <View style={styles.row}>
          <Pressable
            style={[styles.pill, joinPolicy === "instant" && styles.pillActive]}
            onPress={() => setJoinPolicy("instant")}
          >
            <Text style={[styles.pillText, joinPolicy === "instant" && styles.pillTextActive]}>
              Instant
            </Text>
          </Pressable>
          <Pressable
            style={[styles.pill, joinPolicy === "approval" && styles.pillActive]}
            onPress={() => setJoinPolicy("approval")}
          >
            <Text style={[styles.pillText, joinPolicy === "approval" && styles.pillTextActive]}>
              Approval
            </Text>
          </Pressable>
        </View>

      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <DatePickerModal
        visible={calendarOpen}
        title={calendarTarget === "targetDate" ? "Select target date" : "Select tee date"}
        selectedDate={calendarTarget === "targetDate" ? targetDate : teeDate}
        onSelectDate={onSelectCalendarDay}
        onClose={() => setCalendarOpen(false)}
        minimumDate={minimumDate()}
      />

      <TimePickerModal
        visible={timePickerOpen}
        title="Select tee time"
        value={teeTimeValue}
        onChange={setTeeTimeValue}
        onClose={() => setTimePickerOpen(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerSavePill: {
    alignSelf: "center",
    backgroundColor: colors.fairwaySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    maxWidth: 120,
  },
  headerSavePillText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.fairway,
  },
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 28, fontWeight: "700", color: colors.text },
  copy: { color: colors.muted, lineHeight: 20 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 12,
    gap: 10,
  },
  label: {
    color: colors.muted,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontWeight: "700",
    marginTop: 4,
  },
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
  inputWithAccessory: {
    paddingRight: 38,
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
  datePickerText: {
    color: colors.text,
    fontWeight: "600",
  },
  datePickerPlaceholder: {
    color: colors.muted,
    fontWeight: "500",
  },
  loadingHint: { color: colors.muted, fontSize: 12, marginTop: 6 },
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
  row: { flexDirection: "row", gap: 8 },
  flex1: { flex: 1 },
  pill: {
    flex: 1,
    backgroundColor: "#ece8e1",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  pillActive: { backgroundColor: colors.fairway },
  pillText: { color: colors.text, fontWeight: "600" },
  pillTextActive: { color: "#fff" },
  cover: { width: "100%", height: 140, borderRadius: 12 },
  secondaryButton: {
    backgroundColor: "#ece8e1",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: { color: colors.text, fontWeight: "700" },
  disabled: { opacity: 0.5 },
  error: { color: colors.danger },
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
  monthLabel: { color: colors.text, fontSize: 15, fontWeight: "700" },
  weekHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  weekHeaderText: {
    width: "14.2857%",
    textAlign: "center",
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: {
    width: "14.2857%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  daySelected: { backgroundColor: colors.fairway },
  dayDisabled: { opacity: 0.35 },
  dayText: { color: colors.text, fontWeight: "600" },
  dayTextSelected: { color: "#fff" },
  dayTextDisabled: { color: colors.muted },
  modalDoneBtn: {
    backgroundColor: colors.fairway,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
  },
  modalDoneText: { color: "#fff", fontWeight: "700" },
});
