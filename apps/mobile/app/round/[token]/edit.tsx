import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  apiBaseUrl,
  apiGet,
  apiPatch,
  apiPost,
  toAbsoluteUrl,
} from "../../../lib/api";
import { colors } from "../../../lib/theme";
import { RoundDetails } from "../../../types/round";
import { DatePickerModal } from "../../../components/date-picker-modal";
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
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const initialSnapshotRef = useRef<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    if (planningMode) {
      setTeeDate(null);
      setQuery("");
      setResults([]);
      setShowCourseResults(false);
      setSelectedCourse(null);
    }
  }, [planningMode]);

  useEffect(() => {
    async function loadRound() {
      if (!token) return;
      try {
        setError(null);
        const authToken = await getTokenRef.current();
        const data = await apiGet<RoundResponse>(`/api/rounds/${token}`, authToken);
        const round = data.round;
        if (!round.isHost) {
          setError("Only the host can edit this round.");
          return;
        }

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
        const roundTargetDate = new Date(round.targetDate);
        roundTargetDate.setHours(0, 0, 0, 0);
        const roundTeeDate = round.teeTime ? new Date(round.teeTime) : null;
        if (roundTeeDate) roundTeeDate.setHours(0, 0, 0, 0);
        const roundTeeTime = round.teeTime ? new Date(round.teeTime) : new Date();
        initialSnapshotRef.current = JSON.stringify({
          planningMode: round.mode === "planning",
          preferredTimeWindow: round.preferredTimeWindow ?? "morning",
          planningLocation: round.planningLocation?.trim() ?? "",
          targetDate: round.mode === "planning" ? roundTargetDate.toISOString() : null,
          teeDate: round.mode === "scheduled" && roundTeeDate ? roundTeeDate.toISOString() : null,
          teeTime: `${roundTeeTime.getHours()}:${roundTeeTime.getMinutes()}`,
          selectedCourseId: round.mode === "scheduled" ? (round.courseId ?? null) : null,
          totalSpots: round.totalSpots,
          visibility: round.visibility,
          joinPolicy: round.joinPolicy,
          customImageUrl: round.customImageUrl ?? null,
        });
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
    if (uploadingImage || submitting) return false;
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
    uploadingImage,
  ]);

  const currentSnapshot = useMemo(
    () =>
      JSON.stringify({
        planningMode,
        preferredTimeWindow,
        planningLocation: planningLocation.trim(),
        targetDate: targetDate ? startOfDay(targetDate).toISOString() : null,
        teeDate: teeDate ? startOfDay(teeDate).toISOString() : null,
        teeTime: `${teeTimeValue.getHours()}:${teeTimeValue.getMinutes()}`,
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
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  function openCalendar(target: "targetDate" | "teeDate") {
    setCalendarTarget(target);
    setCalendarOpen(true);
  }

  function onSelectCalendarDay(day: Date) {
    const picked = startOfDay(day);
    if (calendarTarget === "targetDate") setTargetDate(picked);
    else setTeeDate(picked);
  }

  function minimumDate() {
    const min = new Date();
    min.setHours(0, 0, 0, 0);
    return min;
  }

  async function pickAndUploadImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Photo permission is required to upload an event image.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: true,
    });
    if (result.canceled || !result.assets[0]?.uri) return;

    setUploadingImage(true);
    setError(null);
    try {
      const authToken = await getTokenRef.current();
      const asset = result.assets[0];
      const imageResponse = await fetch(asset.uri);
      const imageBlob = await imageResponse.blob();
      const formData = new FormData();
      formData.append("file", imageBlob, "event-image.jpg");

      const response = await fetch(`${apiBaseUrl}/api/uploads/event-image`, {
        method: "POST",
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
        body: formData,
      });

      const json = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !json.url) {
        throw new Error(json.error ?? "Image upload failed.");
      }
      setCustomImageUrl(json.url);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Image upload failed.");
    } finally {
      setUploadingImage(false);
    }
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

  useEffect(() => {
    if (!snapshotReady) return;
    if (!canSubmit || submitting || uploadingImage) return;
    if (initialSnapshotRef.current === currentSnapshot) return;
    setSaveNote(null);
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      void submit();
    }, 700);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [snapshotReady, canSubmit, submitting, uploadingImage, currentSnapshot, submit]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.fairway} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Edit round</Text>
      <Text style={styles.copy}>Update details. Changes save automatically.</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Flow</Text>
        <View style={styles.row}>
          <Pressable
            style={[styles.pill, planningMode && styles.pillActive]}
            onPress={() => setPlanningMode(true)}
          >
            <Text style={[styles.pillText, planningMode && styles.pillTextActive]}>
              Plan first
            </Text>
          </Pressable>
          <Pressable
            style={[styles.pill, !planningMode && styles.pillActive]}
            onPress={() => setPlanningMode(false)}
          >
            <Text style={[styles.pillText, !planningMode && styles.pillTextActive]}>
              Set details now
            </Text>
          </Pressable>
        </View>

        {!planningMode ? (
          <>
            <Text style={styles.label}>Event image</Text>
            {customImageUrl ? (
              <Image source={{ uri: toAbsoluteUrl(customImageUrl) }} style={styles.cover} />
            ) : null}
            <Pressable
              style={[styles.secondaryButton, uploadingImage && styles.disabled]}
              onPress={() => void pickAndUploadImage()}
              disabled={uploadingImage}
            >
              <Text style={styles.secondaryButtonText}>
                {uploadingImage
                  ? "Uploading..."
                  : customImageUrl
                    ? "Change image"
                    : "Upload image"}
              </Text>
            </Pressable>
          </>
        ) : null}

        {planningMode ? (
          <>
            <Text style={styles.label}>Target date</Text>
            <Pressable style={styles.datePickerBtn} onPress={() => openCalendar("targetDate")}>
              <Text style={[styles.datePickerText, !targetDate && styles.datePickerPlaceholder]}>
                {formatDateLabel(targetDate)}
              </Text>
              <Ionicons name="calendar-outline" size={18} color={colors.fairway} />
            </Pressable>
            <Text style={styles.label}>Preferred time</Text>
            <View style={styles.row}>
              {[
                { value: "morning", label: "Morning" },
                { value: "afternoon", label: "Afternoon" },
                { value: "twilight", label: "Twilight" },
              ].map((slot) => (
                <Pressable
                  key={slot.value}
                  style={[styles.pill, preferredTimeWindow === slot.value && styles.pillActive]}
                  onPress={() =>
                    setPreferredTimeWindow(
                      slot.value as "morning" | "afternoon" | "twilight",
                    )
                  }
                >
                  <Text
                    style={[
                      styles.pillText,
                      preferredTimeWindow === slot.value && styles.pillTextActive,
                    ]}
                  >
                    {slot.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>Location</Text>
            <TextInput
              value={planningLocation}
              onChangeText={(value) => {
                setPlanningLocation(value);
                setPlanningLocationIsValidated(false);
              }}
              onFocus={() => locationResults.length > 0 && setShowLocationResults(true)}
              placeholder="City, State"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            {loadingLocations ? <Text style={styles.loadingHint}>Searching...</Text> : null}
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
                style={styles.input}
              />
              {query.trim().length > 0 ? (
                <Pressable
                  style={styles.inputClearBtn}
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
              {loadingCourses ? <Text style={styles.loadingHint}>Searching...</Text> : null}
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
      {submitting ? <Text style={styles.success}>Saving...</Text> : null}
      {!submitting && saveNote ? <Text style={styles.success}>{saveNote}</Text> : null}

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
  success: { color: colors.fairway, fontWeight: "600" },
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
