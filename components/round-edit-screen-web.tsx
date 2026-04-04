"use client";

import { useAuth } from "@clerk/nextjs";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ParfadeLoadingBlock, ParfadeSpinner } from "@/components/parfade-spinner";
import { PlanningTimeWindowChipsWeb } from "@/components/planning-time-window-chips-web";
import { useCourseSearchBiasCoordsWeb } from "@/lib/use-course-search-bias-coords-web";

type CourseResult = { id: string; name: string; address: string };
type LocationResult = { label: string; city: string; state: string };

type RoundLoad = {
  inviteToken: string;
  mode: "planning" | "scheduled";
  preferredTimeWindow: "morning" | "afternoon" | "twilight" | null;
  planningLocation: string | null;
  courseId: string | null;
  courseName: string;
  teeTime: string | null;
  targetDate: string;
  totalSpots: number;
  visibility: "private" | "public";
  joinPolicy: "instant" | "approval";
  isHost: boolean;
  customImageUrl: string | null;
};

function useDebounce(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toDateInput(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTeeParts(iso: string) {
  const d = new Date(iso);
  return {
    date: toDateInput(iso),
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function RoundEditScreenWeb({ inviteToken }: { inviteToken: string }) {
  const router = useRouter();
  const { getToken, isLoaded } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isPlanning, setIsPlanning] = useState(true);
  const [preferredTimeWindow, setPreferredTimeWindow] = useState<
    "morning" | "afternoon" | "twilight"
  >("morning");
  const [targetDate, setTargetDate] = useState("");
  const [planningLocation, setPlanningLocation] = useState("");
  const [planningLocationIsValidated, setPlanningLocationIsValidated] = useState(true);
  const [locationResults, setLocationResults] = useState<LocationResult[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [showLocationResults, setShowLocationResults] = useState(false);
  const locationRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CourseResult[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CourseResult | null>(null);
  const [showCourseResults, setShowCourseResults] = useState(false);
  const courseRef = useRef<HTMLDivElement>(null);

  const [teeDate, setTeeDate] = useState("");
  const [teeTimePart, setTeeTimePart] = useState("12:00");

  const [totalSpots, setTotalSpots] = useState(4);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [joinPolicy, setJoinPolicy] = useState<"instant" | "approval">("instant");
  const [customImageUrl, setCustomImageUrl] = useState<string | null>(null);

  const debouncedCourse = useDebounce(query, 300);
  const debouncedPlanningLocation = useDebounce(planningLocation, 300);
  const courseBiasCoords = useCourseSearchBiasCoordsWeb();

  const authHeaders = useCallback(async () => {
    const t = await getToken();
    if (!t) return null;
    return { Authorization: `Bearer ${t}` };
  }, [getToken]);

  const loadRound = useCallback(async () => {
    setLoading(true);
    setBlockedMessage(null);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/rounds/${inviteToken}`, {
        headers: headers ?? undefined,
      });
      const json = (await res.json()) as { round?: RoundLoad; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Round not found.");
      const r = json.round;
      if (!r) throw new Error("Round not found.");
      if (!r.isHost) {
        setBlockedMessage("Only the host can edit this round.");
        return;
      }

      setIsPlanning(r.mode === "planning");
      setPreferredTimeWindow(r.preferredTimeWindow ?? "morning");
      setTotalSpots(r.totalSpots);
      setVisibility(r.visibility);
      setJoinPolicy(r.joinPolicy);
      setCustomImageUrl(r.customImageUrl ?? null);

      if (r.mode === "planning") {
        setTargetDate(toDateInput(r.targetDate));
        const loc = r.planningLocation?.trim() ?? "";
        setPlanningLocation(loc);
        setPlanningLocationIsValidated(loc.length > 0);
      } else {
        if (r.courseId) {
          setSelectedCourse({
            id: r.courseId,
            name: r.courseName ?? "Course",
            address: "",
          });
          setQuery(r.courseName ?? "");
        }
        if (r.teeTime) {
          const { date, time } = toTeeParts(r.teeTime);
          setTeeDate(date);
          setTeeTimePart(time);
        }
      }
    } catch (e) {
      setBlockedMessage(e instanceof Error ? e.message : "Unable to load round.");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, inviteToken]);

  useEffect(() => {
    if (!isLoaded) return;
    void loadRound();
  }, [isLoaded, loadRound]);

  const searchCourses = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoadingCourses(true);
    try {
      const res = await fetch("/api/courses/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q,
          ...(courseBiasCoords
            ? {
                latitude: courseBiasCoords.latitude,
                longitude: courseBiasCoords.longitude,
              }
            : {}),
        }),
      });
      const json = (await res.json()) as { courses: CourseResult[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Search failed.");
      setResults(json.courses);
      setShowCourseResults(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed.");
    } finally {
      setLoadingCourses(false);
    }
  }, [courseBiasCoords]);

  useEffect(() => {
    if (isPlanning) return;
    if (!selectedCourse) {
      void searchCourses(debouncedCourse);
    }
  }, [debouncedCourse, isPlanning, searchCourses, selectedCourse, courseBiasCoords]);

  useEffect(() => {
    if (!isPlanning) return;
    let active = true;
    async function searchLocations(q: string) {
      if (planningLocationIsValidated) {
        if (active) {
          setLocationResults([]);
          setShowLocationResults(false);
          setLoadingLocations(false);
        }
        return;
      }
      if (q.trim().length < 2) {
        if (active) {
          setLocationResults([]);
          setShowLocationResults(false);
        }
        return;
      }
      setLoadingLocations(true);
      try {
        const res = await fetch("/api/locations/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q }),
        });
        const json = (await res.json()) as { locations: LocationResult[]; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Location search failed.");
        if (!active) return;
        setLocationResults(json.locations);
        setShowLocationResults(true);
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Location search failed.");
      } finally {
        if (active) setLoadingLocations(false);
      }
    }
    void searchLocations(debouncedPlanningLocation);
    return () => {
      active = false;
    };
  }, [debouncedPlanningLocation, isPlanning, planningLocationIsValidated]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (courseRef.current && !courseRef.current.contains(e.target as Node)) {
        setShowCourseResults(false);
      }
      if (locationRef.current && !locationRef.current.contains(e.target as Node)) {
        setShowLocationResults(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function selectCourse(c: CourseResult) {
    setSelectedCourse(c);
    setQuery(c.name);
    setShowCourseResults(false);
    setResults([]);
  }

  function clearCourse() {
    setSelectedCourse(null);
    setQuery("");
    setResults([]);
  }

  const canSubmit = useMemo(() => {
    if (isPlanning) {
      return Boolean(
        targetDate &&
          planningLocation.trim().length >= 2 &&
          planningLocationIsValidated &&
          !submitting,
      );
    }
    return Boolean(selectedCourse && teeDate && teeTimePart && !submitting);
  }, [
    isPlanning,
    targetDate,
    planningLocation,
    planningLocationIsValidated,
    selectedCourse,
    teeDate,
    teeTimePart,
    submitting,
  ]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const headers = await authHeaders();
      if (!headers) {
        setError("Sign in to save changes.");
        return;
      }

      const teeTimeIso =
        !isPlanning && teeDate && teeTimePart
          ? new Date(`${teeDate}T${teeTimePart}:00`).toISOString()
          : undefined;

      const body = isPlanning
        ? {
            planningMode: true,
            preferredTimeWindow,
            planningLocation: planningLocation.trim(),
            targetDate: new Date(`${targetDate}T12:00:00`).toISOString(),
            totalSpots,
            visibility,
            joinPolicy,
            customImageUrl: customImageUrl ?? null,
          }
        : {
            planningMode: false,
            courseId: selectedCourse!.id,
            teeTime: teeTimeIso,
            totalSpots,
            visibility,
            joinPolicy,
            customImageUrl: customImageUrl ?? null,
          };

      const res = await fetch(`/api/rounds/${inviteToken}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not save changes.");
      router.push(`/round/${inviteToken}` as Route);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isLoaded || loading) {
    return <ParfadeLoadingBlock className="py-12" message="Loading…" size="md" />;
  }

  if (blockedMessage) {
    return (
      <section className="space-y-4">
        <Link
          href={`/round/${inviteToken}` as Route}
          className="inline-flex items-center gap-1 text-sm font-semibold text-[#1a3c2a]"
        >
          <span aria-hidden>&larr;</span> Round
        </Link>
        <p className="parfade-card text-sm text-red-600">{blockedMessage}</p>
      </section>
    );
  }

  return (
    <section className="space-y-6 pb-10">
      <Link
        href={`/round/${inviteToken}` as Route}
        className="inline-flex items-center gap-1 text-sm font-semibold text-[#1a3c2a]"
      >
        <span aria-hidden>&larr;</span> Round
      </Link>

      <div>
        <h1 className="parfade-page-title">Edit round</h1>
        <p className="parfade-page-sub">
          {isPlanning
            ? "Update target date, location, time window, and who can join."
            : "Update course, tee time, and who can join."}
        </p>
      </div>

      <form
        onSubmit={(ev) => void handleSubmit(ev)}
        className="space-y-2.5 rounded-[18px] border border-[#ece8e1] bg-white p-3 shadow-sm sm:p-3.5"
      >
        {isPlanning ? (
          <div>
            <p className="parfade-label">Target date</p>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="parfade-input"
              required
            />
            <div ref={locationRef} className="relative">
              <p className="parfade-label mt-3">Location</p>
              <input
                type="text"
                value={planningLocation}
                onChange={(e) => {
                  setPlanningLocation(e.target.value);
                  setPlanningLocationIsValidated(false);
                }}
                onFocus={() => locationResults.length > 0 && setShowLocationResults(true)}
                className="parfade-input"
                placeholder="City, State"
                required
              />
              {loadingLocations ? (
                <span className="absolute right-3.5 top-10 flex items-center">
                  <ParfadeSpinner size="xs" variant="muted" aria-label="Searching locations" />
                </span>
              ) : null}
              {showLocationResults && locationResults.length > 0 && (
                <ul className="absolute z-20 mt-2 max-h-44 w-full overflow-auto rounded-2xl bg-white shadow-lg">
                  {locationResults.map((loc) => (
                    <li key={loc.label}>
                      <button
                        type="button"
                        onClick={() => {
                          setPlanningLocation(loc.label);
                          setPlanningLocationIsValidated(true);
                          setLocationResults([]);
                          setShowLocationResults(false);
                        }}
                        className="w-full px-4 py-3 text-left transition hover:bg-cream-100"
                      >
                        <span className="block text-sm font-semibold text-charcoal">{loc.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!planningLocationIsValidated && planningLocation.trim().length > 0 && (
                <p className="mt-2 text-xs text-charcoal-300">Select a suggested city/state.</p>
              )}
            </div>
            <p className="parfade-label mt-3">Preferred time</p>
            <PlanningTimeWindowChipsWeb value={preferredTimeWindow} onChange={setPreferredTimeWindow} />
          </div>
        ) : (
          <>
            <div ref={courseRef} className="relative">
              <p className="parfade-label">Course</p>
              <div className="relative">
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    if (selectedCourse) setSelectedCourse(null);
                  }}
                  onFocus={() => results.length > 0 && setShowCourseResults(true)}
                  className="parfade-input"
                  placeholder="Search golf courses..."
                />
                {loadingCourses ? (
                  <span className="absolute right-3.5 top-3 flex items-center">
                    <ParfadeSpinner size="xs" variant="muted" aria-label="Searching courses" />
                  </span>
                ) : null}
              </div>
              {showCourseResults && results.length > 0 && (
                <ul className="absolute z-20 mt-2 max-h-52 w-full overflow-auto rounded-2xl bg-white shadow-lg">
                  {results.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => selectCourse(c)}
                        className="w-full px-4 py-3 text-left transition hover:bg-cream-100"
                      >
                        <span className="block text-sm font-semibold text-charcoal">{c.name}</span>
                        <span className="block text-xs text-charcoal-300">{c.address}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {selectedCourse && (
                <div className="mt-2 flex items-center justify-between rounded-xl bg-fairway-50 px-4 py-2.5">
                  <span className="text-sm font-semibold text-fairway">{selectedCourse.name}</span>
                  <button
                    type="button"
                    onClick={clearCourse}
                    className="text-xs font-medium text-fairway-400 hover:text-fairway"
                  >
                    Change
                  </button>
                </div>
              )}
            </div>
            <div>
              <p className="parfade-label">Tee time</p>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={teeDate}
                  onChange={(e) => setTeeDate(e.target.value)}
                  className="parfade-input min-w-0 flex-1"
                  required
                />
                <input
                  type="time"
                  value={teeTimePart}
                  onChange={(e) => setTeeTimePart(e.target.value)}
                  className="parfade-input w-[140px] shrink-0"
                  required
                />
              </div>
            </div>
          </>
        )}

        <div>
          <p className="parfade-label">Visibility</p>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as "private" | "public")}
            className="parfade-select"
          >
            <option value="private">Invite only</option>
            <option value="public">Public</option>
          </select>
        </div>

        <div>
          <p className="parfade-label">Looking for</p>
          <div className="flex gap-2">
            {([1, 2, 3] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setTotalSpots(n + 1)}
                className={`flex-1 rounded-xl py-3 text-sm font-semibold transition ${
                  totalSpots === n + 1
                    ? "bg-fairway text-white"
                    : "bg-[#edf4ef] text-[#6e6e6e] hover:bg-[#e2ebe4]"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="parfade-label">Join policy</p>
          <select
            value={joinPolicy}
            onChange={(e) => setJoinPolicy(e.target.value as "instant" | "approval")}
            className="parfade-select"
          >
            <option value="instant">Instant</option>
            <option value="approval">Approval</option>
          </select>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={!canSubmit}
          className="parfade-btn-primary inline-flex w-full items-center justify-center gap-2 disabled:opacity-40 lg:max-w-xs"
        >
          {submitting ? (
            <>
              <ParfadeSpinner size="sm" variant="onPrimary" aria-label="Saving" />
              Saving…
            </>
          ) : (
            "Save changes"
          )}
        </button>
      </form>
    </section>
  );
}
