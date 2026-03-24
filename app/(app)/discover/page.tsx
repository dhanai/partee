"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DiscoverLocationModal,
  type DiscoverLocationResult,
} from "@/components/discover-location-modal";
import { DiscoverDateRangeModal } from "@/components/discover-date-range-modal";
import { useAppHeaderActions } from "@/components/app-header-actions-context";
import { ParfadeLoadingBlock } from "@/components/parfade-spinner";
import { RoundListCardWeb } from "@/components/round-list-card-web";
import {
  formatPlanningHeaderDate,
  formatPlanningWindow,
  formatScheduledCardMeta,
} from "@/lib/round-card-meta";

const DISCOVER_LOCATION_OVERRIDE_KEY = "discover.location.override.v1";

type StoredLocationOverride = {
  label: string;
  lat: number;
  lng: number;
  radiusMiles: number;
};

type DiscoverRound = {
  id: string;
  inviteToken: string;
  mode: "scheduled" | "planning";
  preferredTimeWindow: "morning" | "afternoon" | "twilight" | null;
  planningLocation: string | null;
  courseName: string;
  teeTime: string | null;
  targetDate: string;
  effectiveDate: string;
  totalSpots: number;
  spotsRemaining: number;
  distanceMiles: number | null;
  joinPolicy: "instant" | "approval";
  imageUrl: string;
  confirmedPlayers: Array<{ id: string; name: string; avatar: string | null }>;
};

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function HeaderIconButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border border-[#ece8e1] bg-white text-[#1a3c2a] transition hover:bg-[#faf8f5] active:opacity-90"
    >
      {children}
    </button>
  );
}

export default function DiscoverPage() {
  const { setHeaderActions } = useAppHeaderActions();
  const hasManualLocationRef = useRef(false);

  const [radiusMiles, setRadiusMiles] = useState(25);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<
    "idle" | "locating" | "ready" | "denied" | "unavailable"
  >("idle");
  const [locationLabel, setLocationLabel] = useState("Near me");
  const [locationHydrated, setLocationHydrated] = useState(false);

  const [rounds, setRounds] = useState<DiscoverRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [rangeModalOpen, setRangeModalOpen] = useState(false);

  const [locationQuery, setLocationQuery] = useState("");
  const [locationResults, setLocationResults] = useState<DiscoverLocationResult[]>([]);
  const [locationSearchLoading, setLocationSearchLoading] = useState(false);
  const [showLocationResults, setShowLocationResults] = useState(false);

  const saveOverride = useCallback(
    (next: { label: string; lat: number; lng: number }, radius: number) => {
      const payload: StoredLocationOverride = {
        label: next.label,
        lat: next.lat,
        lng: next.lng,
        radiusMiles: radius,
      };
      try {
        localStorage.setItem(DISCOVER_LOCATION_OVERRIDE_KEY, JSON.stringify(payload));
      } catch {
        /* ignore */
      }
    },
    [],
  );

  const clearOverride = useCallback(() => {
    try {
      localStorage.removeItem(DISCOVER_LOCATION_OVERRIDE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const resolveCurrentLocation = useCallback(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setLocationStatus("unavailable");
      return;
    }
    setLocationStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLocationLabel("Near me");
        setLocationStatus("ready");
      },
      (geoError) => {
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setLocationStatus("denied");
        } else {
          setLocationStatus("unavailable");
        }
      },
      { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: 10000 },
    );
  }, []);

  useEffect(() => {
    let active = true;
    try {
      const raw = localStorage.getItem(DISCOVER_LOCATION_OVERRIDE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredLocationOverride;
        if (
          Number.isFinite(parsed?.lat) &&
          Number.isFinite(parsed?.lng) &&
          typeof parsed?.label === "string"
        ) {
          hasManualLocationRef.current = true;
          if (active) {
            setCoords({ lat: parsed.lat, lng: parsed.lng });
            setLocationLabel(parsed.label);
            setRadiusMiles(
              Number.isFinite(parsed.radiusMiles) ? parsed.radiusMiles : 25,
            );
            setLocationStatus("ready");
          }
          setLocationHydrated(true);
          return;
        }
      }
    } catch {
      /* ignore */
    }
    hasManualLocationRef.current = false;
    resolveCurrentLocation();
    setLocationHydrated(true);
    return () => {
      active = false;
    };
  }, [resolveCurrentLocation]);

  const loadRounds = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (coords) {
      params.set("lat", String(coords.lat));
      params.set("lng", String(coords.lng));
      params.set("distanceMiles", String(radiusMiles));
    }

    try {
      const response = await fetch(`/api/rounds/discover?${params.toString()}`);
      const json = (await response.json()) as { rounds: DiscoverRound[]; error?: string };
      if (!response.ok) {
        throw new Error(json.error ?? "Failed to load rounds.");
      }
      setRounds(json.rounds);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load.");
    } finally {
      setLoading(false);
    }
  }, [coords, radiusMiles]);

  useEffect(() => {
    if (!locationHydrated) return;
    void loadRounds();
  }, [locationHydrated, loadRounds]);

  useEffect(() => {
    if (!locationHydrated) return;
    if (!hasManualLocationRef.current || !coords) return;
    saveOverride({ label: locationLabel, lat: coords.lat, lng: coords.lng }, radiusMiles);
  }, [radiusMiles, coords, locationLabel, locationHydrated, saveOverride]);

  useEffect(() => {
    let active = true;
    const q = locationQuery.trim();
    const currentLabel = locationLabel.trim();
    if (q.length < 2) {
      setLocationSearchLoading(false);
      setLocationResults([]);
      setShowLocationResults(false);
      return;
    }
    if (currentLabel && q.toLowerCase() === currentLabel.toLowerCase()) {
      setLocationResults([]);
      setShowLocationResults(false);
      return;
    }

    setLocationSearchLoading(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch("/api/locations/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: q }),
          });
          const data = (await response.json()) as {
            locations?: Array<{
              label: string;
              city: string;
              state: string;
              lat: number | null;
              lng: number | null;
            }>;
          };
          if (!active) return;
          const mapped: DiscoverLocationResult[] = (data.locations ?? [])
            .filter((l) => l.lat != null && l.lng != null)
            .map((l) => ({
              label: l.label,
              city: l.city,
              state: l.state,
              lat: l.lat as number,
              lng: l.lng as number,
            }));
          setLocationResults(mapped);
          setShowLocationResults(mapped.length > 0);
        } catch {
          if (active) {
            setLocationResults([]);
            setShowLocationResults(false);
          }
        } finally {
          if (active) setLocationSearchLoading(false);
        }
      })();
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [locationQuery, locationLabel]);

  const filteredRounds = useMemo(() => {
    return rounds.filter((round) => {
      const when = new Date(round.effectiveDate);
      if (startDate && when < startOfDay(startDate)) return false;
      if (endDate) {
        const endBoundary = startOfDay(endDate);
        endBoundary.setHours(23, 59, 59, 999);
        if (when > endBoundary) return false;
      }
      return true;
    });
  }, [rounds, startDate, endDate]);

  const openLocationModal = useCallback(() => {
    if (locationLabel && locationLabel !== "Near me") {
      setLocationQuery(locationLabel);
    } else {
      setLocationQuery("");
    }
    setLocationResults([]);
    setShowLocationResults(false);
    setLocationModalOpen(true);
  }, [locationLabel]);

  const openRangeModal = useCallback(() => {
    setRangeModalOpen(true);
  }, []);

  useEffect(() => {
    setHeaderActions(
      <div className="flex max-w-[min(260px,calc(100vw-140px))] items-center gap-2 lg:max-w-[min(340px,calc(100vw-220px))]">
        <span
          className="min-w-0 flex-1 truncate text-left text-xs font-semibold text-[#1c1c1e]"
          title={locationLabel}
        >
          {locationLabel}
        </span>
        <HeaderIconButton onClick={openLocationModal} label="Open location and radius picker">
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 21s7-4.35 7-10a7 7 0 1 0-14 0c0 5.65 7 10 7 10Z"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="11" r="2.25" stroke="currentColor" strokeWidth="1.75" />
          </svg>
        </HeaderIconButton>
        <HeaderIconButton onClick={openRangeModal} label="Open date range picker">
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.75" />
            <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </HeaderIconButton>
      </div>,
    );
    return () => setHeaderActions(null);
  }, [locationLabel, openLocationModal, openRangeModal, setHeaderActions]);

  function formatDateShort(date: Date | null) {
    return date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Any";
  }

  const selectedLabel =
    startDate && endDate
      ? `${formatDateShort(startDate)} – ${formatDateShort(endDate)}`
      : startDate
        ? formatDateShort(startDate)
        : null;

  function clearDateRange() {
    setStartDate(null);
    setEndDate(null);
    setRangeModalOpen(false);
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="parfade-page-title">Discover</h1>
        <p className="parfade-page-sub">Open rounds looking for players.</p>
      </div>

      {locationStatus !== "ready" && (
        <p className="text-xs text-charcoal-300">
          {locationStatus === "locating"
            ? "Detecting your location for nearby rounds..."
            : "Location unavailable. Showing all public rounds."}
        </p>
      )}

      {selectedLabel ? (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-[#f1efea] px-3 py-2.5">
          <span className="text-sm font-semibold text-[#1c1c1e]">{selectedLabel}</span>
          <button
            type="button"
            onClick={clearDateRange}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#ece8e1] text-[#6e6e6e] hover:bg-[#e2ddd4]"
            aria-label="Clear date range"
          >
            ×
          </button>
        </div>
      ) : null}

      {error && <p className="parfade-card text-sm text-red-600">{error}</p>}

      {loading ? <ParfadeLoadingBlock className="py-6" size="sm" /> : null}

      {!loading && rounds.length === 0 && (
        <div className="parfade-card text-center text-sm text-charcoal-300">
          No open rounds right now.
        </div>
      )}

      {!loading && rounds.length > 0 && filteredRounds.length === 0 && (
        <div className="parfade-card space-y-3 text-left">
          <p className="text-sm font-semibold text-[#1c1c1e]">No rounds match this filter</p>
          <p className="text-sm text-charcoal-300">
            Try a wider date range, larger radius, or switch location.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={clearDateRange}
              className="rounded-full bg-[#ece8e1] px-3 py-2 text-xs font-bold text-[#1c1c1e]"
            >
              Clear dates
            </button>
            <button
              type="button"
              onClick={openLocationModal}
              className="rounded-full bg-[#1a3c2a] px-3 py-2 text-xs font-bold text-white"
            >
              Change location
            </button>
          </div>
        </div>
      )}

      <ul className="space-y-3">
        {filteredRounds.map((round) => (
          <li key={round.id}>
            <RoundListCardWeb
              href={`/round/${round.inviteToken}`}
              roundId={round.id}
              mode={round.mode}
              courseName={round.courseName}
              imageUrl={round.imageUrl}
              joinPolicy={round.joinPolicy}
              totalSpots={round.totalSpots}
              confirmedPlayers={round.confirmedPlayers}
              primaryMeta={
                round.mode === "scheduled"
                  ? formatScheduledCardMeta(round.effectiveDate, round.teeTime)
                  : formatPlanningWindow(round.preferredTimeWindow)
              }
              planningLocation={round.planningLocation}
              planningHeaderDate={formatPlanningHeaderDate(round.effectiveDate)}
              preferredTimeWindow={round.preferredTimeWindow}
            />
          </li>
        ))}
      </ul>

      <DiscoverLocationModal
        open={locationModalOpen}
        onClose={() => setLocationModalOpen(false)}
        locationQuery={locationQuery}
        onLocationQueryChange={setLocationQuery}
        locationResults={locationResults}
        showResults={showLocationResults}
        searchLoading={locationSearchLoading}
        onPickLocation={(item) => {
          hasManualLocationRef.current = true;
          setCoords({ lat: item.lat, lng: item.lng });
          setLocationStatus("ready");
          setLocationLabel(item.label);
          setLocationQuery(item.label);
          setLocationResults([]);
          setShowLocationResults(false);
          setLocationModalOpen(false);
          saveOverride({ label: item.label, lat: item.lat, lng: item.lng }, radiusMiles);
        }}
        onUseCurrentLocation={() => {
          hasManualLocationRef.current = false;
          clearOverride();
          setLocationModalOpen(false);
          resolveCurrentLocation();
        }}
        onSearchFocus={() => {
          if (locationResults.length > 0) setShowLocationResults(true);
        }}
        radiusMiles={radiusMiles}
        onRadiusSelect={(miles) => {
          setRadiusMiles(miles);
          setLocationModalOpen(false);
        }}
      />

      <DiscoverDateRangeModal
        open={rangeModalOpen}
        onClose={() => setRangeModalOpen(false)}
        startDate={startDate}
        endDate={endDate}
        onApply={(nextStart, nextEnd) => {
          setStartDate(nextStart);
          setEndDate(nextEnd);
        }}
      />
    </section>
  );
}
