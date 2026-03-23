"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

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
  hostName: string;
  spotsRemaining: number;
  distanceMiles: number | null;
  joinPolicy: "instant" | "approval";
  imageUrl: string;
};

export default function DiscoverPage() {
  const [date, setDate] = useState("");
  const [radiusMiles, setRadiusMiles] = useState("25");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<
    "idle" | "locating" | "ready" | "denied" | "unavailable"
  >("idle");
  const [rounds, setRounds] = useState<DiscoverRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRounds = useCallback(async (filterDate?: string) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (filterDate) params.set("date", filterDate);
    if (coords) {
      params.set("lat", String(coords.lat));
      params.set("lng", String(coords.lng));
      params.set("distanceMiles", radiusMiles);
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
    loadRounds();
  }, [loadRounds]);

  useEffect(() => {
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

  function handleDateChange(value: string) {
    setDate(value);
    loadRounds(value || undefined);
  }

  function clearDate() {
    setDate("");
    loadRounds();
  }

  function formatPlanningWindow(
    value: "morning" | "afternoon" | "twilight" | null | undefined,
  ) {
    if (!value) return "Time TBD";
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="parfade-page-title">Discover</h1>
        <p className="parfade-page-sub">Open rounds looking for players.</p>
      </div>

      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
        <input
          type="date"
          value={date}
          onChange={(e) => handleDateChange(e.target.value)}
          className="parfade-input w-full sm:max-w-[190px]"
        />
        {date && (
          <button
            type="button"
            onClick={clearDate}
            className="text-sm font-medium text-fairway"
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {[
          { label: "10 mi", value: "10" },
          { label: "25 mi", value: "25" },
          { label: "50 mi", value: "50" },
          { label: "100 mi", value: "100" },
          { label: "Any", value: "9999" },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setRadiusMiles(option.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              radiusMiles === option.value
                ? "bg-fairway text-white"
                : "bg-[#edf4ef] text-[#6e6e6e] hover:bg-[#e2ebe4]"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {locationStatus !== "ready" && (
        <p className="text-xs text-charcoal-300">
          {locationStatus === "locating"
            ? "Detecting your location for nearby rounds..."
            : "Location unavailable. Showing all public rounds."}
        </p>
      )}

      {error && (
        <p className="parfade-card text-sm text-red-600">{error}</p>
      )}

      {loading && (
        <p className="text-sm text-charcoal-300">Loading...</p>
      )}

      {!loading && rounds.length === 0 && (
        <div className="parfade-card text-center text-sm text-charcoal-300">
          No open rounds{date ? ` on ${date}` : ""} right now.
        </div>
      )}

      <ul className="space-y-3">
        {rounds.map((round) => (
          <li key={round.id}>
            <Link
              href={`/round/${round.inviteToken}`}
              className="parfade-card block p-4 transition hover:shadow-md sm:p-5"
            >
              <div className="space-y-3">
                <Image
                  src={round.imageUrl}
                  alt={round.courseName}
                  width={1200}
                  height={700}
                  className="h-40 w-full rounded-2xl object-cover"
                />
                <div className="space-y-1">
                  <p className="text-xl font-semibold leading-tight text-charcoal">
                    {round.courseName}
                  </p>
                  <p className="text-base text-charcoal-400">
                    {new Date(round.effectiveDate).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    {round.mode === "planning"
                      ? `• ${formatPlanningWindow(round.preferredTimeWindow)}`
                      : `at ${new Date(round.teeTime as string).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}`}
                  </p>
                  {round.mode === "planning" && round.planningLocation ? (
                    <p className="text-sm text-charcoal-300">{round.planningLocation}</p>
                  ) : (
                    <p className="text-sm text-charcoal-300">Hosted by {round.hostName}</p>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-fairway-50 px-3 py-1 text-sm font-semibold text-fairway">
                    {round.spotsRemaining} spot{round.spotsRemaining !== 1 ? "s" : ""}
                  </span>
                  <span className="rounded-full bg-cream-200 px-3 py-1 text-xs font-medium text-charcoal-400">
                    {round.mode === "planning"
                      ? "Planning round"
                      : round.joinPolicy === "instant"
                        ? "Instant claim"
                        : "Host approval"}
                  </span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
