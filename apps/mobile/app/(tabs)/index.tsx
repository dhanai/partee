import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { DiscoverHouseAdRow } from "../../components/discover-house-ad-row";
import { DiscoverNativeAdRow } from "../../components/discover-native-ad-row";
import { RoundListCard } from "../../components/round-list-card";
import { apiGet, apiPost } from "../../lib/api";
import {
  formatPlanningHeaderDate,
  formatPlanningWindow,
  formatScheduledCardMeta,
} from "../../lib/round-card-meta";
import { prefetchPublicProfile } from "../../lib/public-profile-cache";
import { buildRoundListHint, prefetchRoundOpen } from "../../lib/round-details-cache";
import {
  applyOptimisticToDiscoverRound,
  subscribeRoundListsRefresh,
} from "../../lib/round-lists-refresh";
import { buildDiscoverFeedRows } from "../../lib/discover-feed-ad-rows";
import { resolveDiscoverAdDisplay, shouldShowDiscoverHouseAd } from "../../lib/discover-house-ad";
import { getHousePromosCached, type HousePromoSlotClient } from "../../lib/house-promo-api";
import { colors } from "../../lib/theme";
import { DiscoverRound } from "../../types/round";

type DiscoverResponse = {
  rounds: DiscoverRound[];
  nextCursor: string | null;
  hasMore: boolean;
};
type LocationResult = { label: string; city: string; state: string; lat: number; lng: number };
type StoredLocationOverride = {
  label: string;
  lat: number;
  lng: number;
  radiusMiles: number;
};

const DISCOVER_LOCATION_OVERRIDE_KEY = "discover.location.override.v1";

export default function DiscoverScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const [rounds, setRounds] = useState<DiscoverRound[]>([]);
  const [radiusMiles, setRadiusMiles] = useState(25);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<
    "idle" | "locating" | "ready" | "denied" | "unavailable"
  >("idle");
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [draftStartDate, setDraftStartDate] = useState<Date | null>(null);
  const [draftEndDate, setDraftEndDate] = useState<Date | null>(null);
  const [rangeModalOpen, setRangeModalOpen] = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [locationLabel, setLocationLabel] = useState("Near me");
  const [locationQuery, setLocationQuery] = useState("");
  const [locationResults, setLocationResults] = useState<LocationResult[]>([]);
  const [locationSearchLoading, setLocationSearchLoading] = useState(false);
  const [showLocationResults, setShowLocationResults] = useState(false);
  const [locationHydrated, setLocationHydrated] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [discoverCursor, setDiscoverCursor] = useState<string | null>(null);
  const [hasMoreDiscover, setHasMoreDiscover] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [houseDiscoverFromApi, setHouseDiscoverFromApi] = useState<HousePromoSlotClient | null>(null);
  const roundsRef = useRef<DiscoverRound[]>([]);
  const hasManualLocationRef = useRef(false);
  const loadRoundsRef = useRef<
    ((options?: { reset?: boolean; distanceMiles?: number; overrideCoords?: { lat: number; lng: number } }) => Promise<void>) | null
  >(null);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    roundsRef.current = rounds;
  }, [rounds]);

  const saveManualLocationOverride = useCallback(
    async (next: { label: string; lat: number; lng: number }, radius = radiusMiles) => {
      const payload: StoredLocationOverride = {
        label: next.label,
        lat: next.lat,
        lng: next.lng,
        radiusMiles: radius,
      };
      await SecureStore.setItemAsync(DISCOVER_LOCATION_OVERRIDE_KEY, JSON.stringify(payload));
    },
    [radiusMiles],
  );

  const clearManualLocationOverride = useCallback(async () => {
    await SecureStore.deleteItemAsync(DISCOVER_LOCATION_OVERRIDE_KEY);
  }, []);

  const resolveCurrentLocation = useCallback(async () => {
    setLocationStatus("locating");
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") {
      setLocationStatus("denied");
      return;
    }
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const reverse = await Location.reverseGeocodeAsync({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });
    const place = reverse[0];
    setCoords({
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    });
    setLocationLabel(place?.city && place?.region ? `${place.city}, ${place.region}` : "Near me");
    setLocationStatus("ready");
  }, []);

  useEffect(() => {
    let active = true;
    async function hydrateLocation() {
      try {
        const raw = await SecureStore.getItemAsync(DISCOVER_LOCATION_OVERRIDE_KEY);
        if (!active) return;
        if (raw) {
          const parsed = JSON.parse(raw) as StoredLocationOverride;
          if (
            Number.isFinite(parsed?.lat) &&
            Number.isFinite(parsed?.lng) &&
            typeof parsed?.label === "string"
          ) {
            hasManualLocationRef.current = true;
            setCoords({ lat: parsed.lat, lng: parsed.lng });
            setLocationLabel(parsed.label);
            setRadiusMiles(parsed.radiusMiles || 25);
            setLocationStatus("ready");
            setLocationHydrated(true);
            return;
          }
        }
        hasManualLocationRef.current = false;
        await resolveCurrentLocation();
        if (!active || hasManualLocationRef.current) {
          return;
        }
      } catch {
        if (!active) return;
        setLocationStatus("unavailable");
      } finally {
        if (active) setLocationHydrated(true);
      }
    }
    void hydrateLocation();
    return () => {
      active = false;
    };
  }, [resolveCurrentLocation]);

  useLayoutEffect(() => {
    const openLocationModal = () => {
      if (locationLabel && locationLabel !== "Near me") {
        setLocationQuery(locationLabel);
      } else {
        setLocationQuery("");
      }
      setLocationResults([]);
      setShowLocationResults(false);
      setLocationModalOpen(true);
    };

    navigation.setOptions({
      headerRightContainerStyle: {
        paddingRight: 12,
      },
      headerRight: () => (
        <View style={styles.headerActionsRow}>
          <Text style={styles.headerLocationText} numberOfLines={1}>
            {locationLabel}
          </Text>
          <Pressable
            style={styles.headerCalendarBtn}
            onPress={openLocationModal}
            accessibilityLabel="Open location and radius picker"
          >
            <Ionicons name="location-outline" size={18} color={colors.fairway} />
          </Pressable>
          <Pressable
            style={styles.headerCalendarBtn}
            onPress={() => {
              setDraftStartDate(startDate);
              setDraftEndDate(endDate);
              setRangeModalOpen(true);
            }}
            accessibilityLabel="Open date range picker"
          >
            <Ionicons name="calendar-outline" size={18} color={colors.fairway} />
          </Pressable>
        </View>
      ),
    });
  }, [navigation, locationLabel]);

  const loadRounds = useCallback(async (options?: { reset?: boolean; distanceMiles?: number; overrideCoords?: { lat: number; lng: number } }) => {
    const reset = options?.reset ?? false;
    if (!reset && (!hasMoreDiscover || loadingMore)) return;
    const effectiveRadius = options?.distanceMiles ?? radiusMiles;
    const effectiveCoords = options?.overrideCoords ?? coords;
    try {
      setError(null);
      if (reset) {
        // Keep header/modals stable once initial data has rendered.
        if (roundsRef.current.length === 0) {
          setLoading(true);
        }
      } else {
        setLoadingMore(true);
      }
      const authToken = await getTokenRef.current();
      const params = new URLSearchParams();
      if (effectiveCoords) {
        params.set("lat", String(effectiveCoords.lat));
        params.set("lng", String(effectiveCoords.lng));
        params.set("distanceMiles", String(effectiveRadius));
      }
      params.set("limit", "20");
      if (!reset && discoverCursor) {
        params.set("cursor", discoverCursor);
      }
      const data = await apiGet<DiscoverResponse>(
        `/api/rounds/discover${params.toString() ? `?${params.toString()}` : ""}`,
        authToken,
      );
      setRounds((prev) => (reset ? data.rounds : [...prev, ...data.rounds]));
      setDiscoverCursor(data.nextCursor);
      setHasMoreDiscover(data.hasMore);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unable to load.");
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [coords, radiusMiles, discoverCursor, hasMoreDiscover, loadingMore]);

  useEffect(() => {
    loadRoundsRef.current = loadRounds;
  }, [loadRounds]);

  useEffect(() => {
    return subscribeRoundListsRefresh((payload) => {
      if (payload.optimistic) {
        const p = payload.optimistic;
        setRounds((prev) => prev.map((r) => applyOptimisticToDiscoverRound(r, p)));
      }
      if (!locationHydrated) return;
      void loadRoundsRef.current?.({ reset: true });
    });
  }, [locationHydrated]);

  useFocusEffect(
    useCallback(() => {
      if (!locationHydrated) return;
      void loadRoundsRef.current?.({ reset: true });
    }, [locationHydrated]),
  );

  useFocusEffect(
    useCallback(() => {
      void getHousePromosCached()
        .then((p) => setHouseDiscoverFromApi(p.discover))
        .catch(() => setHouseDiscoverFromApi(null));
    }, []),
  );

  useEffect(() => {
    if (!locationHydrated) return;
    if (!hasManualLocationRef.current || !coords) return;
    void saveManualLocationOverride(
      { label: locationLabel, lat: coords.lat, lng: coords.lng },
      radiusMiles,
    );
  }, [radiusMiles, coords, locationLabel, locationHydrated, saveManualLocationOverride]);

  useEffect(() => {
    let active = true;
    async function runLocationSearch() {
      const q = locationQuery.trim();
      const currentLabel = locationLabel.trim();
      if (q.length < 2) {
        if (active) {
          setLocationSearchLoading(false);
          setLocationResults([]);
          setShowLocationResults(false);
        }
        return;
      }
      if (currentLabel && q.toLowerCase() === currentLabel.toLowerCase()) {
        if (active) {
          setLocationResults([]);
          setShowLocationResults(false);
        }
        return;
      }
      setLocationSearchLoading(true);
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
        if (active) setLocationSearchLoading(false);
      }
    }
    const timer = setTimeout(() => {
      void runLocationSearch();
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [locationQuery, locationLabel]);

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

  const discoverFeedRows = useMemo(
    () => buildDiscoverFeedRows(filteredRounds),
    [filteredRounds],
  );

  const discoverHouseDisplay = useMemo(
    () => resolveDiscoverAdDisplay(houseDiscoverFromApi),
    [houseDiscoverFromApi],
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.fairway} />
      </View>
    );
  }

  function formatDateShort(date: Date | null) {
    return date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Any";
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
    if (!draftStartDate || !draftEndDate) return false;
    const d = startOfDay(day).getTime();
    return d >= startOfDay(draftStartDate).getTime() && d <= startOfDay(draftEndDate).getTime();
  }

  function applyRange(nextStart: Date | null, nextEnd: Date | null) {
    setStartDate(nextStart);
    setEndDate(nextEnd);
    setRangeModalOpen(false);
  }

  function onSelectDay(day: Date) {
    const picked = startOfDay(day);
    if (!draftStartDate || (draftStartDate && draftEndDate)) {
      setDraftStartDate(picked);
      setDraftEndDate(null);
      return;
    }
    const draftStart = startOfDay(draftStartDate);
    if (picked.getTime() === draftStart.getTime()) {
      applyRange(draftStart, draftStart);
      return;
    }
    if (picked.getTime() < draftStart.getTime()) {
      setDraftStartDate(picked);
      setDraftEndDate(null);
      return;
    }
    setDraftEndDate(picked);
    applyRange(draftStart, picked);
  }

  function applyDraftRange() {
    if (!draftStartDate) return;
    applyRange(draftStartDate, draftEndDate ?? draftStartDate);
  }

  function cancelRangeModal() {
    setDraftStartDate(startDate);
    setDraftEndDate(endDate);
    setRangeModalOpen(false);
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

  const listHeader = (
    <>
      <Text style={styles.heading}>Discover</Text>
      <Text style={styles.subheading}>Open rounds looking for players.</Text>
      {locationStatus !== "ready" ? (
        <Text style={styles.locationHint}>
          {locationStatus === "locating"
            ? "Finding your location for nearby rounds..."
            : "Location unavailable. Showing all public rounds."}
        </Text>
      ) : null}
      {selectedLabel ? (
        <View style={styles.rangeRow}>
          <Text style={styles.rangeText}>{selectedLabel}</Text>
          <Pressable
            style={styles.rangeClearBtn}
            onPress={() => {
              setStartDate(null);
              setEndDate(null);
              setDraftStartDate(null);
              setDraftEndDate(null);
              setRangeModalOpen(false);
            }}
            accessibilityLabel="Clear date range"
          >
            <Ionicons name="close" size={15} color={colors.muted} />
          </Pressable>
        </View>
      ) : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        style={styles.container}
        contentContainerStyle={styles.content}
        data={discoverFeedRows}
        keyExtractor={(item) => (item.type === "round" ? item.round.id : item.slotId)}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="golf-outline" size={18} color={colors.fairway} />
            </View>
            <Text style={styles.emptyTitle}>No rounds match this filter</Text>
            <Text style={styles.emptyText}>
              Try a wider date range, larger radius, or switch location.
            </Text>
            <View style={styles.emptyActionsRow}>
              <Pressable
                style={styles.emptySecondaryBtn}
                onPress={() => {
                  setStartDate(null);
                  setEndDate(null);
                  setDraftStartDate(null);
                  setDraftEndDate(null);
                  setRangeModalOpen(false);
                }}
              >
                <Text style={styles.emptySecondaryBtnText}>Clear dates</Text>
              </Pressable>
              <Pressable
                style={styles.emptyPrimaryBtn}
                onPress={() => {
                  if (locationLabel && locationLabel !== "Near me") {
                    setLocationQuery(locationLabel);
                  } else {
                    setLocationQuery("");
                  }
                  setLocationResults([]);
                  setShowLocationResults(false);
                  setLocationModalOpen(true);
                }}
              >
                <Text style={styles.emptyPrimaryBtnText}>Change location</Text>
              </Pressable>
            </View>
          </View>
        }
        ListFooterComponent={
          loadingMore ? <ActivityIndicator color={colors.fairway} style={styles.loadingMore} /> : null
        }
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews={false}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          setDiscoverCursor(null);
          setHasMoreDiscover(true);
          void getHousePromosCached(true)
            .then((p) => setHouseDiscoverFromApi(p.discover))
            .catch(() => {});
          void loadRounds({ reset: true });
        }}
        onEndReachedThreshold={0.35}
        onEndReached={() => {
          if (loading || refreshing || loadingMore || !hasMoreDiscover) return;
          void loadRounds({ reset: false });
        }}
        renderItem={({ item }) =>
          item.type === "ad" ? (
            discoverHouseDisplay && shouldShowDiscoverHouseAd(item.slotId, discoverHouseDisplay) ? (
              <DiscoverHouseAdRow display={discoverHouseDisplay} slotIndex={item.adIndex} />
            ) : (
              <DiscoverNativeAdRow />
            )
          ) : (
            <RoundListCard
              roundId={item.round.id}
              mode={item.round.mode === "scheduled" ? "scheduled" : "planning"}
              courseName={item.round.courseName}
              imageUrl={item.round.imageUrl}
              joinPolicy={item.round.joinPolicy}
              totalSpots={item.round.totalSpots}
              confirmedPlayers={item.round.confirmedPlayers}
              onCardPressIn={() =>
                prefetchRoundOpen(
                  item.round.inviteToken,
                  item.round.imageUrl,
                  () => getTokenRef.current(),
                )
              }
              onPress={() =>
                router.push({
                  pathname: "/round/[token]",
                  params: {
                    token: item.round.inviteToken,
                    roundHint: buildRoundListHint(item.round),
                  },
                })
              }
              primaryMeta={
                item.round.mode === "scheduled"
                  ? formatScheduledCardMeta(item.round.effectiveDate, item.round.teeTime)
                  : formatPlanningWindow(item.round.preferredTimeWindow)
              }
              planningLocation={item.round.planningLocation}
              planningHeaderDate={formatPlanningHeaderDate(item.round.effectiveDate)}
              preferredTimeWindow={item.round.preferredTimeWindow}
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
          )
        }
      />

      <Modal visible={rangeModalOpen} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={cancelRangeModal}>
          <Pressable
            style={styles.modalCard}
            onPress={(event) => event.stopPropagation()}
          >
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
                const isPast =
                  startOfDay(dayDate).getTime() < startOfDay(new Date()).getTime();
                const isStart = draftStartDate ? isSameDay(dayDate, draftStartDate) : false;
                const isEnd = draftEndDate ? isSameDay(dayDate, draftEndDate) : false;
                const inRange = !isPast && isInSelectedRange(dayDate);
                return (
                  <Pressable
                    key={`day-${calendarMonth.getFullYear()}-${calendarMonth.getMonth()}-${dayNum}-${idx}`}
                    style={[
                      styles.dayCell,
                      inRange && styles.dayInRange,
                      isPast && styles.dayDisabled,
                    ]}
                    onPress={() => {
                      if (isPast) return;
                      onSelectDay(dayDate);
                    }}
                    disabled={isPast}
                  >
                    <View style={[styles.dayPill, (isStart || isEnd) && styles.dayPillSelected]}>
                      <Text
                        style={[
                          styles.dayText,
                          (isStart || isEnd) && styles.dayTextSelected,
                          isPast && styles.dayTextDisabled,
                        ]}
                      >
                        {dayNum}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              style={[styles.modalDoneBtn, !draftStartDate && styles.modalDoneDisabled]}
              onPress={applyDraftRange}
              disabled={!draftStartDate}
            >
              <Text style={styles.modalDoneText}>Apply</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={locationModalOpen} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setLocationModalOpen(false)}>
          <Pressable
            style={styles.modalCard}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={styles.modalTitle}>Location & radius</Text>
            <Pressable
              style={styles.useCurrentBtn}
              onPress={async () => {
                try {
                  hasManualLocationRef.current = false;
                  await clearManualLocationOverride();
                  await resolveCurrentLocation();
                  setLocationModalOpen(false);
                  void loadRoundsRef.current?.({ reset: true });
                } catch {
                  setLocationStatus("unavailable");
                }
              }}
            >
              <Ionicons name="locate-outline" size={16} color={colors.fairway} />
              <Text style={styles.useCurrentText}>Use current location</Text>
            </Pressable>

            <View style={styles.locationInputRow}>
              <TextInput
                value={locationQuery}
                onChangeText={setLocationQuery}
                onFocus={() => locationResults.length > 0 && setShowLocationResults(true)}
                placeholder="Search City, State"
                placeholderTextColor={colors.muted}
                style={[styles.locationInput, styles.locationInputWithAccessory]}
              />
              {locationSearchLoading && locationQuery.trim().length >= 2 ? (
                <View style={styles.locationInputAccessory} accessibilityLabel="Searching locations">
                  <ActivityIndicator size="small" color={colors.muted} />
                </View>
              ) : locationQuery.trim().length > 0 ? (
                <Pressable
                  style={styles.locationInputClearBtn}
                  onPress={() => {
                    setLocationQuery("");
                    setLocationResults([]);
                    setShowLocationResults(false);
                  }}
                  accessibilityLabel="Clear location search"
                >
                  <Ionicons name="close" size={14} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
            {showLocationResults &&
              locationResults.map((item) => (
                <Pressable
                  key={item.label}
                  style={styles.listRow}
                  onPress={async () => {
                    hasManualLocationRef.current = true;
                    const newCoords = { lat: item.lat, lng: item.lng };
                    setCoords(newCoords);
                    setLocationStatus("ready");
                    setLocationLabel(item.label);
                    setLocationQuery(item.label);
                    setLocationResults([]);
                    setShowLocationResults(false);
                    setLocationModalOpen(false);
                    void loadRoundsRef.current?.({ reset: true, overrideCoords: newCoords });
                    await saveManualLocationOverride({
                      label: item.label,
                      lat: item.lat,
                      lng: item.lng,
                    });
                  }}
                >
                  <Text style={styles.listTitle}>{item.label}</Text>
                </Pressable>
              ))}

            <Text style={styles.labelText}>Radius</Text>
            <View style={styles.radiusRow}>
              {[10, 25, 50, 100].map((miles) => (
                <Pressable
                  key={miles}
                  style={[styles.radiusPill, radiusMiles === miles && styles.radiusPillActive]}
                  onPress={() => {
                    setRadiusMiles(miles);
                    setLocationModalOpen(false);
                    void loadRoundsRef.current?.({ reset: true, distanceMiles: miles });
                  }}
                >
                  <Text
                    style={[
                      styles.radiusPillText,
                      radiusMiles === miles && styles.radiusPillTextActive,
                    ]}
                  >
                    {miles} mi
                  </Text>
                </Pressable>
              ))}
              <Pressable
                style={[styles.radiusPill, radiusMiles >= 9999 && styles.radiusPillActive]}
                onPress={() => {
                  setRadiusMiles(9999);
                  setLocationModalOpen(false);
                  void loadRoundsRef.current?.({ reset: true, distanceMiles: 9999 });
                }}
              >
                <Text
                  style={[
                    styles.radiusPillText,
                    radiusMiles >= 9999 && styles.radiusPillTextActive,
                  ]}
                >
                  Any
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  heading: { fontSize: 28, fontWeight: "700", color: colors.text },
  subheading: { color: colors.muted, marginBottom: 8 },
  headerActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: 260,
  },
  headerLocationText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "600",
    maxWidth: 160,
  },
  radiusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 2 },
  radiusPill: {
    backgroundColor: "#ece8e1",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  radiusPillActive: { backgroundColor: colors.fairway },
  radiusPillText: { color: colors.text, fontWeight: "600", fontSize: 12 },
  radiusPillTextActive: { color: "#fff" },
  locationHint: { color: colors.muted, fontSize: 12, marginBottom: 2 },
  errorText: {
    color: colors.danger,
    backgroundColor: "#fee4e2",
    padding: 10,
    borderRadius: 12,
  },
  emptyText: { color: colors.muted, paddingVertical: 6 },
  emptyCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    gap: 8,
    alignItems: "flex-start",
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
  emptyActionsRow: { flexDirection: "row", gap: 8, marginTop: 2 },
  emptyPrimaryBtn: {
    backgroundColor: colors.fairway,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  emptyPrimaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  emptySecondaryBtn: {
    backgroundColor: "#ece8e1",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  emptySecondaryBtnText: { color: colors.text, fontWeight: "700", fontSize: 12 },
  loadingMore: { marginVertical: 10 },
  rangeRow: {
    backgroundColor: "#f1efea",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rangeText: {
    color: colors.text,
    fontWeight: "600",
  },
  rangeClearBtn: {
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ece8e1",
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
  useCurrentBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f3f1ed",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignSelf: "flex-start",
  },
  useCurrentText: { color: colors.fairway, fontWeight: "700", fontSize: 12 },
  locationInputRow: {
    position: "relative",
  },
  locationInput: {
    backgroundColor: "#f1efea",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    color: colors.text,
  },
  locationInputWithAccessory: {
    paddingRight: 38,
  },
  locationInputAccessory: {
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
  locationInputClearBtn: {
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
  labelText: {
    color: colors.muted,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontWeight: "700",
    marginTop: 4,
  },
  listRow: {
    backgroundColor: "#f9f7f3",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listTitle: { color: colors.text, fontWeight: "600" },
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
    gap: 8,
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
    marginBottom: 4,
  },
  dayCell: {
    width: "14.2857%",
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  dayInRange: {
    backgroundColor: colors.fairwaySoft,
  },
  dayPill: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  dayPillSelected: {
    backgroundColor: colors.fairway,
  },
  dayDisabled: {
    opacity: 0.35,
  },
  dayText: {
    color: colors.text,
    fontWeight: "600",
    textAlign: "center",
    width: "100%",
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
  modalDoneDisabled: { opacity: 0.45 },
  modalDoneText: {
    color: "#fff",
    fontWeight: "700",
  },
});
