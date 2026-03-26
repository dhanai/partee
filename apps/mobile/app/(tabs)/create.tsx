import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiGet, apiPost, toAbsoluteUrl } from "../../lib/api";
import { hapticSuccess, hapticError } from "../../lib/haptics";
import type { InviteSelectionUser } from "../../lib/invite-selection-store";
import { colors } from "../../lib/theme";
import { DatePickerModal } from "../../components/date-picker-modal";
import { InviteFriendsSheet } from "../../components/invite-friends-sheet";
import { PlanningTimeWindowChips } from "../../components/planning-time-window-chips";
import { TimePickerModal } from "../../components/time-picker-modal";

type CourseResult = {
  id: string;
  name: string;
  address: string;
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
type MyGroupOption = { id: string; name: string; imageUrl: string | null };

function defaultTopOfHourDate() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  return d;
}

function useDebounce(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export default function CreateScreen() {
  const { mode, session: sessionParam, groupId: groupIdParam } = useLocalSearchParams<{
    mode?: string;
    session?: string;
    groupId?: string;
  }>();
  const session = useMemo(() => {
    const raw = Array.isArray(sessionParam) ? sessionParam[0] : sessionParam;
    return typeof raw === "string" ? raw : "";
  }, [sessionParam]);
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
  const [teeTimeValue, setTeeTimeValue] = useState<Date>(() => defaultTopOfHourDate());
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarTarget, setCalendarTarget] = useState<"targetDate" | "teeDate">(
    "targetDate",
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CourseResult[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CourseResult | null>(null);
  const [selectedFriends, setSelectedFriends] = useState<InviteSelectionUser[]>([]);
  const [totalSpots, setTotalSpots] = useState(4);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [joinPolicy, setJoinPolicy] = useState<"instant" | "approval">("instant");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCourseResults, setShowCourseResults] = useState(false);
  const [eventImageUri, setEventImageUri] = useState<string | null>(null);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDetails, setEventDetails] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventDate, setEventDate] = useState<Date | null>(null);
  const [eventTime, setEventTime] = useState<Date>(() => defaultTopOfHourDate());
  const [eventCost, setEventCost] = useState("");
  const [eventRsvpDeadlineDate, setEventRsvpDeadlineDate] = useState<Date | null>(null);
  const [eventRsvpDeadlineTime, setEventRsvpDeadlineTime] = useState<Date>(() =>
    defaultTopOfHourDate(),
  );
  const [eventDatePickerOpen, setEventDatePickerOpen] = useState(false);
  const [eventTimePickerOpen, setEventTimePickerOpen] = useState(false);
  const [eventDeadlineDatePickerOpen, setEventDeadlineDatePickerOpen] = useState(false);
  const [eventDeadlineTimePickerOpen, setEventDeadlineTimePickerOpen] = useState(false);
  const debouncedCourseQuery = useDebounce(query, 320);
  const debouncedPlanningLocation = useDebounce(planningLocation, 320);
  const [inviteSheetOpen, setInviteSheetOpen] = useState(false);
  const prevSessionRef = useRef<string | null>(null);
  const [myGroups, setMyGroups] = useState<MyGroupOption[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(
    typeof groupIdParam === "string" ? groupIdParam : null,
  );

  /**
   * Each pick from the create sheet sends a new `session` id (same or different mode).
   * Reset the full draft + invite key so every entry from the sheet is a fresh form.
   * Returning from Invite Friends does not change `session`, so the draft stays intact.
   */
  useEffect(() => {
    const prev = prevSessionRef.current;
    if (prev === null) {
      prevSessionRef.current = session;
      return;
    }
    if (prev === session) return;
    prevSessionRef.current = session;

    setSelectedFriends([]);

    setTargetDate(null);
    setPlanningLocation("");
    setPlanningLocationIsValidated(true);
    setLocationResults([]);
    setShowLocationResults(false);
    setLoadingLocations(false);
    setPreferredTimeWindow("morning");
    setTeeDate(null);
    setTeeTimeValue(defaultTopOfHourDate());
    setTimePickerOpen(false);
    setCalendarOpen(false);
    setCalendarTarget("targetDate");
    setQuery("");
    setResults([]);
    setLoadingCourses(false);
    setSelectedCourse(null);
    setTotalSpots(4);
    setVisibility("private");
    setJoinPolicy("instant");
    setSubmitting(false);
    setError(null);
    setSuccess(null);
    setShowCourseResults(false);
    setEventImageUri(null);
    setEventTitle("");
    setEventDetails("");
    setEventLocation("");
    setEventDate(null);
    setEventTime(defaultTopOfHourDate());
    setEventCost("");
    setEventRsvpDeadlineDate(null);
    setEventRsvpDeadlineTime(defaultTopOfHourDate());
    setEventDatePickerOpen(false);
    setEventTimePickerOpen(false);
    setEventDeadlineDatePickerOpen(false);
    setEventDeadlineTimePickerOpen(false);
    setSelectedGroupId(typeof groupIdParam === "string" ? groupIdParam : null);
  }, [session, groupIdParam]);

  useEffect(() => {
    if (!isScheduledRound) {
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

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const token = await getTokenRef.current();
        const data = await apiGet<{ myGroups: MyGroupOption[] }>("/api/groups", token);
        if (active) setMyGroups(data.myGroups);
      } catch {
        // ignore
      }
    })();
    return () => { active = false; };
  }, []);

  const canSubmit = useMemo(() => {
    if (submitting) return false;
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
  ]);

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
    Keyboard.dismiss();
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
          inviteeUserIds: selectedFriends.map((friend) => friend.id),
          groupId: selectedGroupId || undefined,
        },
        token,
      );
      hapticSuccess();
      setSuccess(
        json.invitedCount > 0
          ? `Round created. Invite blast sent to ${json.invitedCount} golfers.`
          : "Round created.",
      );
      router.replace({
        pathname: "/(tabs)/rounds",
        params: {
          tab: "hosting",
          refresh: String(Date.now()),
          createdToken: json.round.inviteToken,
        },
      });
    } catch (submitError) {
      hapticError();
      setError(submitError instanceof Error ? submitError.message : "Create failed.");
    } finally {
      setSubmitting(false);
    }
  }

  function openInviteFriends() {
    setInviteSheetOpen(true);
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
    >
      <Text style={styles.title}>
        {createType === "planning" ? "Planning Round" : "Scheduled Tee Time"}
      </Text>
      <Text style={styles.copy}>
        {createType === "planning"
          ? "Find players first. Lock details later."
          : "Set it up. Blast invites. Tee off."}
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
                    Keyboard.dismiss();
                    setPlanningLocation(item.label);
                    setPlanningLocationIsValidated(true);
                    setLocationResults([]);
                    setShowLocationResults(false);
                  }}
                >
                  <Text style={styles.listTitle}>{item.label}</Text>
                </Pressable>
              ))}
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
            {showCourseResults && results.map((course) => (
              <Pressable
                key={course.id}
                style={styles.listRow}
                onPress={() => {
                  Keyboard.dismiss();
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
                onPress={() => { Keyboard.dismiss(); setTimePickerOpen(true); }}
              >
                <Text style={styles.datePickerText}>{formatTimeLabel(teeTimeValue)}</Text>
                <Ionicons name="time-outline" size={18} color={colors.fairway} />
              </Pressable>
            </View>
          </>
        ) : null}

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

            <Text style={styles.label}>Looking for</Text>
            <View style={styles.row}>
              {([1, 2, 3] as const).map((n) => (
                <Pressable
                  key={n}
                  style={[styles.pill, totalSpots === n + 1 && styles.pillActive]}
                  onPress={() => setTotalSpots(n + 1)}
                >
                  <Text style={[styles.pillText, totalSpots === n + 1 && styles.pillTextActive]}>
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

            <Text style={styles.label}>
              {selectedGroupId ? "Post to group" : "Invite friends"}
            </Text>

            {!selectedGroupId ? (
              <>
                <Pressable style={styles.secondaryButton} onPress={openInviteFriends}>
                  <Text style={styles.secondaryButtonText}>
                    {selectedFriends.length > 0
                      ? `${selectedFriends.length} friend${selectedFriends.length === 1 ? "" : "s"} selected`
                      : "Select friends"}
                  </Text>
                </Pressable>
                {selectedFriends.map((friend) => (
                  <View key={friend.id} style={styles.selectedRow}>
                    <View style={styles.selectedInfo}>
                      {friend.avatar ? (
                        <Image
                          source={{ uri: toAbsoluteUrl(friend.avatar) }}
                          style={styles.selectedAvatar}
                        />
                      ) : (
                        <View style={[styles.selectedAvatar, styles.selectedAvatarFallback]}>
                          <Text style={styles.selectedAvatarInitial}>
                            {friend.name.trim().charAt(0).toUpperCase() || "?"}
                          </Text>
                        </View>
                      )}
                      <Text style={styles.selectedText} numberOfLines={1}>
                        {friend.name}
                      </Text>
                    </View>
                    <Pressable
                      style={styles.selectedRemoveBtn}
                      onPress={() =>
                        setSelectedFriends((prev) => prev.filter((user) => user.id !== friend.id))
                      }
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    </Pressable>
                  </View>
                ))}
              </>
            ) : (
              <View style={styles.groupChipRow}>
                <Pressable
                  style={[styles.groupChip, styles.groupChipActive]}
                  onPress={() => setSelectedGroupId(null)}
                >
                  <Text style={styles.groupChipTextActive}>
                    {myGroups.find((g) => g.id === selectedGroupId)?.name ?? "Group"}
                  </Text>
                  <Ionicons name="close-circle" size={16} color="#fff" />
                </Pressable>
              </View>
            )}

            {!selectedGroupId && myGroups.length > 0 && selectedFriends.length === 0 ? (
              <View style={styles.groupPickerWrap}>
                <Text style={styles.groupPickerOr}>or post to a group</Text>
                <View style={styles.groupChipRow}>
                  {myGroups.map((g) => (
                    <Pressable
                      key={g.id}
                      style={styles.groupChip}
                      onPress={() => {
                        setSelectedGroupId(g.id);
                        setSelectedFriends([]);
                      }}
                    >
                      {g.imageUrl ? (
                        <Image source={{ uri: g.imageUrl }} style={styles.groupChipAvatar} />
                      ) : (
                        <Ionicons name="people" size={14} color={colors.muted} />
                      )}
                      <Text style={styles.groupChipText}>{g.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
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
            {submitting ? "Creating..." : "Create round"}
          </Text>
        </Pressable>
      </View>

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

      <InviteFriendsSheet
        visible={inviteSheetOpen}
        onClose={() => setInviteSheetOpen(false)}
        onConfirm={(users) => {
          setSelectedFriends(users);
          if (users.length > 0) setSelectedGroupId(null);
          setInviteSheetOpen(false);
        }}
        confirmLabel="Add friends"
        initialSelected={selectedFriends}
      />
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
    gap: 8,
  },
  selectedInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  selectedAvatar: {
    width: 28,
    height: 28,
    borderRadius: 999,
  },
  selectedAvatarFallback: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedAvatarInitial: {
    color: colors.fairway,
    fontSize: 12,
    fontWeight: "700",
  },
  selectedText: { color: colors.text, fontWeight: "600", flexShrink: 1 },
  selectedRemoveBtn: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
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
  groupPickerWrap: { marginTop: 8, gap: 6 },
  groupPickerOr: { color: colors.muted, fontSize: 13, fontWeight: "600", textAlign: "center" },
  groupChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  groupChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  groupChipActive: {
    backgroundColor: colors.fairway,
    borderColor: colors.fairway,
  },
  groupChipText: { color: colors.text, fontWeight: "600", fontSize: 13 },
  groupChipTextActive: { color: "#fff", fontWeight: "600", fontSize: 13 },
  groupChipAvatar: { width: 18, height: 18, borderRadius: 6 },
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
    width: "14.2857%",
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
    width: "14.2857%",
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
