import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiBaseUrl, apiGet, apiPost, toAbsoluteUrl } from "../../lib/api";
import { colors } from "../../lib/theme";

type CourseResult = {
  id: string;
  name: string;
  address: string;
};

type UserSearchResult = {
  id: string;
  name: string;
  email: string | null;
  avatar: string | null;
};

type CreateRoundResponse = {
  round: {
    id: string;
    inviteToken: string;
  };
  invitePath: string;
  invitedCount: number;
};
type MeResponse = {
  user: {
    location: string | null;
    homeCourse: string | null;
  };
};
type LocationResult = { label: string; city: string; state: string };
type CreateType = "planning" | "scheduled" | "tournament" | "event";

function useDebounce(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export default function CreateScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const createType: CreateType = useMemo(() => {
    if (mode === "planning") return "planning";
    if (mode === "scheduled") return "scheduled";
    if (mode === "tournament") return "tournament";
    if (mode === "event") return "event";
    return "scheduled";
  }, [mode]);
  const isPlanningRound = createType === "planning";
  const isScheduledRound = createType === "scheduled";
  const isRoundType = isPlanningRound || isScheduledRound;
  const [targetDate, setTargetDate] = useState<Date | null>(null);
  const [planningLocation, setPlanningLocation] = useState("");
  const [planningLocationIsValidated, setPlanningLocationIsValidated] = useState(true);
  const [locationResults, setLocationResults] = useState<LocationResult[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [showLocationResults, setShowLocationResults] = useState(false);
  const [preferredTimeWindow, setPreferredTimeWindow] = useState<
    "morning" | "afternoon" | "twilight"
  >("morning");
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
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CourseResult[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CourseResult | null>(null);
  const [friendQuery, setFriendQuery] = useState("");
  const [friendResults, setFriendResults] = useState<UserSearchResult[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<UserSearchResult[]>([]);
  const [totalSpots, setTotalSpots] = useState(4);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [joinPolicy, setJoinPolicy] = useState<"instant" | "approval">("instant");
  const [customImageUrl, setCustomImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCourseResults, setShowCourseResults] = useState(false);
  const [showFriendResults, setShowFriendResults] = useState(false);
  const [eventImageUri, setEventImageUri] = useState<string | null>(null);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDetails, setEventDetails] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventDate, setEventDate] = useState<Date | null>(null);
  const [eventTime, setEventTime] = useState<Date>(() => {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    return now;
  });
  const [eventCost, setEventCost] = useState("");
  const [eventRsvpDeadlineDate, setEventRsvpDeadlineDate] = useState<Date | null>(null);
  const [eventRsvpDeadlineTime, setEventRsvpDeadlineTime] = useState<Date>(() => {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    return now;
  });
  const [eventDatePickerOpen, setEventDatePickerOpen] = useState(false);
  const [eventTimePickerOpen, setEventTimePickerOpen] = useState(false);
  const [eventDeadlineDatePickerOpen, setEventDeadlineDatePickerOpen] = useState(false);
  const [eventDeadlineTimePickerOpen, setEventDeadlineTimePickerOpen] = useState(false);
  const debouncedCourseQuery = useDebounce(query, 320);
  const debouncedFriendQuery = useDebounce(friendQuery, 320);
  const debouncedPlanningLocation = useDebounce(planningLocation, 320);

  useEffect(() => {
    if (!isScheduledRound) {
      setCustomImageUrl(null);
      setTeeDate(null);
    }
  }, [isScheduledRound]);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    let active = true;
    async function loadDefaultPlanningLocation() {
      if (!isPlanningRound) return;
      try {
        const token = await getTokenRef.current();
        const json = await apiGet<MeResponse>("/api/users/me", token);
        const fallbackLocation =
          json.user.location?.trim() ?? json.user.homeCourse?.trim() ?? "";
        if (!active || !fallbackLocation) return;
        setPlanningLocation((prev) => (prev.trim().length > 0 ? prev : fallbackLocation));
        setPlanningLocationIsValidated((prev) => (prev ? prev : true));
      } catch {
        // Ignore profile preload failures on create page.
      }
    }
    void loadDefaultPlanningLocation();
    return () => {
      active = false;
    };
  }, [isPlanningRound]);

  const canSubmit = useMemo(() => {
    if (uploadingImage || submitting) return false;
    if (isPlanningRound) {
      return Boolean(
        targetDate &&
          planningLocation.trim().length >= 2 &&
          planningLocationIsValidated,
      );
    }
    if (isScheduledRound) return Boolean(selectedCourse && teeDate);
    return false;
  }, [
    isPlanningRound,
    isScheduledRound,
    targetDate,
    planningLocation,
    planningLocationIsValidated,
    selectedCourse,
    teeDate,
    submitting,
    uploadingImage,
  ]);

  function startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function isSameDay(a: Date, b: Date) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
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

  function openCalendar(target: "targetDate" | "teeDate") {
    setCalendarTarget(target);
    const selected = target === "targetDate" ? targetDate : teeDate;
    const base = selected ?? new Date();
    setCalendarMonth(new Date(base.getFullYear(), base.getMonth(), 1));
    setCalendarOpen(true);
  }

  function onSelectCalendarDay(day: Date) {
    const picked = startOfDay(day);
    if (calendarTarget === "targetDate") {
      setTargetDate(picked);
    } else {
      setTeeDate(picked);
    }
    setCalendarOpen(false);
  }

  function shiftMonth(delta: number) {
    const next = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth() + delta,
      1,
    );
    const currentMonthStart = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    );
    if (next < currentMonthStart) return;
    setCalendarMonth(next);
  }

  useEffect(() => {
    if (!isScheduledRound) return;
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
        const token = await getTokenRef.current();
        const json = await apiPost<{ courses: CourseResult[] }>(
          "/api/courses/search",
          { query: q },
          token,
        );
        if (!active) return;
        setResults(json.courses);
        setShowCourseResults(true);
      } catch (searchError) {
        if (!active) return;
        setError(searchError instanceof Error ? searchError.message : "Search failed.");
      } finally {
        if (active) setLoadingCourses(false);
      }
    }

    void runCourseSearch();
    return () => {
      active = false;
    };
  }, [debouncedCourseQuery, isScheduledRound, selectedCourse]);

  useEffect(() => {
    let active = true;

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
        const token = await getTokenRef.current();
        const json = await apiGet<{ users: UserSearchResult[] }>(
          `/api/users/search?q=${encodeURIComponent(q)}`,
          token,
        );
        if (!active) return;
        setFriendResults(
          json.users.filter(
            (user) => !selectedFriends.some((selected) => selected.id === user.id),
          ),
        );
        setShowFriendResults(true);
      } catch (searchError) {
        if (!active) return;
        setError(searchError instanceof Error ? searchError.message : "Search failed.");
      } finally {
        if (active) setLoadingFriends(false);
      }
    }

    void runFriendSearch();
    return () => {
      active = false;
    };
  }, [debouncedFriendQuery, selectedFriends]);

  useEffect(() => {
    let active = true;
    async function runLocationSearch() {
      if (!isPlanningRound) return;
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
        const token = await getTokenRef.current();
        const json = await apiPost<{ locations: LocationResult[] }>(
          "/api/locations/search",
          { query: q },
          token,
        );
        if (!active) return;
        setLocationResults(json.locations);
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
  }, [debouncedPlanningLocation, isPlanningRound, planningLocationIsValidated]);

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
      const token = await getToken();
      const asset = result.assets[0];
      const imageResponse = await fetch(asset.uri);
      const imageBlob = await imageResponse.blob();
      const formData = new FormData();
      formData.append("file", imageBlob, "event-image.jpg");

      const response = await fetch(`${apiBaseUrl}/api/uploads/event-image`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
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

  async function pickEventImage() {
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
    setEventImageUri(result.assets[0].uri);
  }

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getToken();
      let teeTimeIso: string | undefined;
      if (isScheduledRound && teeDate) {
        const combined = new Date(teeDate);
        combined.setHours(
          teeTimeValue.getHours(),
          teeTimeValue.getMinutes(),
          0,
          0,
        );
        teeTimeIso = combined.toISOString();
      }

      const planningTargetDateIso =
        isPlanningRound && targetDate
          ? (() => {
              const noon = new Date(targetDate);
              noon.setHours(12, 0, 0, 0);
              return noon.toISOString();
            })()
          : undefined;

      const json = await apiPost<CreateRoundResponse>(
        "/api/rounds",
        {
          planningMode: isPlanningRound,
          preferredTimeWindow: isPlanningRound ? preferredTimeWindow : undefined,
          planningLocation: isPlanningRound ? planningLocation.trim() : undefined,
          courseId: isPlanningRound ? undefined : selectedCourse?.id,
          teeTime: teeTimeIso,
          targetDate: planningTargetDateIso,
          totalSpots,
          visibility,
          joinPolicy,
          customImageUrl,
          inviteeUserIds: selectedFriends.map((friend) => friend.id),
        },
        token,
      );
      setSuccess(
        json.invitedCount > 0
          ? `Round created. Invite blast sent to ${json.invitedCount} golfers.`
          : "Round created.",
      );
      router.push({
        pathname: "/round/[token]",
        params: { token: json.round.inviteToken },
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Create failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>
        {createType === "planning"
          ? "Planning Round"
          : createType === "scheduled"
            ? "Scheduled Tee Time"
            : createType === "tournament"
              ? "Tournament"
              : "Event"}
      </Text>
      <Text style={styles.copy}>
        {createType === "planning"
          ? "Find players first. Lock details later."
          : createType === "scheduled"
            ? "Set it up. Blast invites. Tee off."
            : createType === "tournament"
              ? "Tournament details UI is ready. Persistence is next."
              : "Broad event flow for meetups, markets, and more."}
      </Text>

      <View style={styles.card}>
        {isScheduledRound ? (
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
            <View style={styles.row}>
              {[
                { value: "morning", label: "Morning" },
                { value: "afternoon", label: "Afternoon" },
                { value: "twilight", label: "Twilight" },
              ].map((slot) => (
                <Pressable
                  key={slot.value}
                  style={[
                    styles.pill,
                    preferredTimeWindow === slot.value && styles.pillActive,
                  ]}
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
        ) : isScheduledRound ? (
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
            {showCourseResults && results.map((course) => (
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
        ) : (
          <>
            <Text style={styles.label}>Image</Text>
            {eventImageUri ? <Image source={{ uri: eventImageUri }} style={styles.cover} /> : null}
            <Pressable style={styles.secondaryButton} onPress={() => void pickEventImage()}>
              <Text style={styles.secondaryButtonText}>
                {eventImageUri ? "Change image" : "Add image"}
              </Text>
            </Pressable>

            <Text style={styles.label}>Title</Text>
            <TextInput
              value={eventTitle}
              onChangeText={setEventTitle}
              placeholder={createType === "tournament" ? "Tournament title" : "Event title"}
              placeholderTextColor={colors.muted}
              style={styles.input}
            />

            <Text style={styles.label}>Details</Text>
            <TextInput
              value={eventDetails}
              onChangeText={setEventDetails}
              placeholder="What this is about..."
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.multilineInput]}
              multiline
            />

            <Text style={styles.label}>Location</Text>
            <TextInput
              value={eventLocation}
              onChangeText={setEventLocation}
              placeholder="City, venue, or address"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />

            <Text style={styles.label}>Date & time</Text>
            <View style={styles.row}>
              <Pressable
                style={[styles.datePickerBtn, styles.flex1]}
                onPress={() => setEventDatePickerOpen(true)}
              >
                <Text style={[styles.datePickerText, !eventDate && styles.datePickerPlaceholder]}>
                  {formatDateLabel(eventDate)}
                </Text>
                <Ionicons name="calendar-outline" size={18} color={colors.fairway} />
              </Pressable>
              <Pressable
                style={[styles.datePickerBtn, styles.flex1]}
                onPress={() => setEventTimePickerOpen(true)}
              >
                <Text style={styles.datePickerText}>{formatTimeLabel(eventTime)}</Text>
                <Ionicons name="time-outline" size={18} color={colors.fairway} />
              </Pressable>
            </View>

            <Text style={styles.label}>Cost (optional)</Text>
            <TextInput
              value={eventCost}
              onChangeText={setEventCost}
              placeholder="$0 or $25"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />

            <Text style={styles.label}>RSVP deadline (optional)</Text>
            <View style={styles.row}>
              <Pressable
                style={[styles.datePickerBtn, styles.flex1]}
                onPress={() => setEventDeadlineDatePickerOpen(true)}
              >
                <Text
                  style={[
                    styles.datePickerText,
                    !eventRsvpDeadlineDate && styles.datePickerPlaceholder,
                  ]}
                >
                  {formatDateLabel(eventRsvpDeadlineDate)}
                </Text>
                <Ionicons name="calendar-outline" size={18} color={colors.fairway} />
              </Pressable>
              <Pressable
                style={[styles.datePickerBtn, styles.flex1]}
                onPress={() => setEventDeadlineTimePickerOpen(true)}
              >
                <Text style={styles.datePickerText}>{formatTimeLabel(eventRsvpDeadlineTime)}</Text>
                <Ionicons name="time-outline" size={18} color={colors.fairway} />
              </Pressable>
            </View>
            <Text style={styles.loadingHint}>
              RSVP defaults: Yes/No for most types, Yes/No/Maybe for events.
            </Text>

            <Text style={styles.loadingHint}>
              Save/publish for {createType} will be wired next.
            </Text>
          </>
        )}

        {isRoundType ? (
          <>
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

            <Text style={styles.label}>Invite friends</Text>
            <View>
              <TextInput
                value={friendQuery}
                onChangeText={setFriendQuery}
                onFocus={() => friendResults.length > 0 && setShowFriendResults(true)}
                placeholder="Name or email..."
                placeholderTextColor={colors.muted}
                style={styles.input}
              />
              {loadingFriends ? <Text style={styles.loadingHint}>Searching...</Text> : null}
            </View>
            {showFriendResults && friendResults.map((friend) => (
              <Pressable
                key={friend.id}
                style={styles.listRow}
                onPress={() => {
                  setSelectedFriends((prev) => [...prev, friend]);
                  setFriendResults((prev) => prev.filter((u) => u.id !== friend.id));
                  setShowFriendResults(true);
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
                    setSelectedFriends((prev) => prev.filter((u) => u.id !== friend.id))
                  }
                >
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </>
        ) : null}

      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {success ? <Text style={styles.success}>{success}</Text> : null}
      <View style={styles.actionWrap}>
        <Pressable
          style={[styles.primaryButton, !canSubmit && styles.disabled]}
          onPress={() => void submit()}
          disabled={!canSubmit}
        >
          <Text style={styles.primaryButtonText}>
            {isRoundType
              ? submitting
                ? "Creating..."
                : "Create round"
              : createType === "tournament"
                ? "Create tournament (coming soon)"
                : "Create event (coming soon)"}
          </Text>
        </Pressable>
      </View>

      <Modal visible={calendarOpen} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setCalendarOpen(false)}>
          <Pressable
            style={styles.modalCard}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={styles.modalTitle}>
              {calendarTarget === "targetDate" ? "Select target date" : "Select tee date"}
            </Text>
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
                if (dayNum === null) return <View key={`empty-${idx}`} style={styles.dayCell} />;
                const dayDate = new Date(
                  calendarMonth.getFullYear(),
                  calendarMonth.getMonth(),
                  dayNum,
                );
                const isPast =
                  startOfDay(dayDate).getTime() < startOfDay(new Date()).getTime();
                const selected =
                  calendarTarget === "targetDate"
                    ? targetDate
                      ? isSameDay(dayDate, targetDate)
                      : false
                    : teeDate
                      ? isSameDay(dayDate, teeDate)
                      : false;
                return (
                  <Pressable
                    key={`day-${dayNum}`}
                    style={[
                      styles.dayCell,
                      selected && styles.daySelected,
                      isPast && styles.dayDisabled,
                    ]}
                    onPress={() => {
                      if (isPast) return;
                      onSelectCalendarDay(dayDate);
                    }}
                    disabled={isPast}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        selected && styles.dayTextSelected,
                        isPast && styles.dayTextDisabled,
                      ]}
                    >
                      {dayNum}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable style={styles.modalDoneBtn} onPress={() => setCalendarOpen(false)}>
              <Text style={styles.modalDoneText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {timePickerOpen && (
        <DateTimePicker
          value={teeTimeValue}
          mode="time"
          display="default"
          onChange={(event: DateTimePickerEvent, selected?: Date) => {
            setTimePickerOpen(false);
            if (event.type === "set" && selected) {
              setTeeTimeValue(selected);
            }
          }}
        />
      )}
      {eventDatePickerOpen && (
        <DateTimePicker
          value={eventDate ?? new Date()}
          mode="date"
          display="default"
          onChange={(event: DateTimePickerEvent, selected?: Date) => {
            setEventDatePickerOpen(false);
            if (event.type === "set" && selected) {
              setEventDate(selected);
            }
          }}
        />
      )}
      {eventTimePickerOpen && (
        <DateTimePicker
          value={eventTime}
          mode="time"
          display="default"
          onChange={(event: DateTimePickerEvent, selected?: Date) => {
            setEventTimePickerOpen(false);
            if (event.type === "set" && selected) {
              setEventTime(selected);
            }
          }}
        />
      )}
      {eventDeadlineDatePickerOpen && (
        <DateTimePicker
          value={eventRsvpDeadlineDate ?? new Date()}
          mode="date"
          display="default"
          onChange={(event: DateTimePickerEvent, selected?: Date) => {
            setEventDeadlineDatePickerOpen(false);
            if (event.type === "set" && selected) {
              setEventRsvpDeadlineDate(selected);
            }
          }}
        />
      )}
      {eventDeadlineTimePickerOpen && (
        <DateTimePicker
          value={eventRsvpDeadlineTime}
          mode="time"
          display="default"
          onChange={(event: DateTimePickerEvent, selected?: Date) => {
            setEventDeadlineTimePickerOpen(false);
            if (event.type === "set" && selected) {
              setEventRsvpDeadlineTime(selected);
            }
          }}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
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
  multilineInput: {
    minHeight: 90,
    textAlignVertical: "top",
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
  loadingHint: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 6,
  },
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
  actionWrap: { marginTop: 2, gap: 6 },
  primaryButton: {
    backgroundColor: colors.fairway,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 6,
  },
  primaryButtonText: { color: "#fff", fontWeight: "700" },
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
  daySelected: {
    backgroundColor: colors.fairway,
  },
  dayDisabled: {
    opacity: 0.35,
  },
  dayText: {
    color: colors.text,
    fontWeight: "600",
  },
  dayTextSelected: {
    color: "#fff",
  },
  dayTextDisabled: {
    color: colors.muted,
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
