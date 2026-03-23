"use client";

import {
  FormEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { ParfadeLoadingBlock, ParfadeSpinner } from "@/components/parfade-spinner";
import { PlanningTimeWindowChipsWeb } from "@/components/planning-time-window-chips-web";

type CourseResult = { id: string; name: string; address: string };
type UserSearchResult = { id: string; name: string; email: string | null; avatar: string | null };
type CreateRoundResponse = { round: { id: string; inviteToken: string }; invitePath: string; invitedCount: number };
type MeResponse = { user: { location: string | null; homeCourse: string | null } };
type LocationResult = { label: string; city: string; state: string };

function useDebounce(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function CreateRoundPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const modeParam = searchParams.get("mode");
  const sessionFromUrl = searchParams.get("session") ?? "";
  const isPlanningRound = modeParam === "planning";

  const prevSessionRef = useRef<string | null>(null);

  useEffect(() => {
    const validMode = modeParam === "planning" || modeParam === "scheduled";
    const session = sessionFromUrl.trim();
    if (!validMode || !session) {
      const m = modeParam === "planning" ? "planning" : "scheduled";
      router.replace(`/create?mode=${m}&session=${session || Date.now()}`);
    }
  }, [modeParam, sessionFromUrl, router]);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CourseResult[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CourseResult | null>(null);
  const [showCourseResults, setShowCourseResults] = useState(false);
  const courseRef = useRef<HTMLDivElement>(null);

  const [friendQuery, setFriendQuery] = useState("");
  const [friendResults, setFriendResults] = useState<UserSearchResult[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<UserSearchResult[]>([]);
  const [showFriendResults, setShowFriendResults] = useState(false);
  const friendRef = useRef<HTMLDivElement>(null);

  const [teeDate, setTeeDate] = useState("");
  const [teeTimePart, setTeeTimePart] = useState("12:00");
  const [targetDate, setTargetDate] = useState("");
  const [planningLocation, setPlanningLocation] = useState("");
  const [planningLocationIsValidated, setPlanningLocationIsValidated] = useState(true);
  const [locationResults, setLocationResults] = useState<LocationResult[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [showLocationResults, setShowLocationResults] = useState(false);
  const locationRef = useRef<HTMLDivElement>(null);
  const [preferredTimeWindow, setPreferredTimeWindow] = useState<
    "morning" | "afternoon" | "twilight"
  >("morning");
  const [totalSpots, setTotalSpots] = useState(4);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [joinPolicy, setJoinPolicy] = useState<"instant" | "approval">("instant");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdInvitePath, setCreatedInvitePath] = useState<string | null>(null);
  const [createdInvitedCount, setCreatedInvitedCount] = useState(0);
  const [customImageUrl, setCustomImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const debouncedCourse = useDebounce(query, 300);
  const debouncedFriend = useDebounce(friendQuery, 300);
  const debouncedPlanningLocation = useDebounce(planningLocation, 300);
  const canSubmit = useMemo(
    () =>
      isPlanningRound
        ? Boolean(
            targetDate &&
              planningLocation.trim().length >= 2 &&
              planningLocationIsValidated &&
              !submitting &&
              !uploadingImage,
          )
        : Boolean(
            selectedCourse &&
              teeDate &&
              teeTimePart &&
              !submitting &&
              !uploadingImage,
          ),
    [
      isPlanningRound,
      selectedCourse,
      teeDate,
      teeTimePart,
      targetDate,
      planningLocation,
      planningLocationIsValidated,
      submitting,
      uploadingImage,
    ],
  );

  const searchCourses = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return; }
    setLoadingCourses(true);
    try {
      const res = await fetch("/api/courses/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
      const json = (await res.json()) as { courses: CourseResult[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Search failed.");
      setResults(json.courses);
      setShowCourseResults(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Search failed."); }
    finally { setLoadingCourses(false); }
  }, []);

  useEffect(() => { if (!selectedCourse) searchCourses(debouncedCourse); }, [debouncedCourse, searchCourses, selectedCourse]);

  const searchFriends = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setFriendResults([]); return; }
    setLoadingFriends(true);
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(q.trim())}`);
      const json = (await res.json()) as { users: UserSearchResult[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Search failed.");
      setFriendResults(json.users.filter((u) => !selectedFriends.some((s) => s.id === u.id)));
      setShowFriendResults(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Search failed."); }
    finally { setLoadingFriends(false); }
  }, [selectedFriends]);

  useEffect(() => { searchFriends(debouncedFriend); }, [debouncedFriend, searchFriends]);

  useEffect(() => {
    if (!isPlanningRound) return;
    let active = true;
    async function searchLocations(q: string) {
      if (planningLocationIsValidated) {
        if (!active) return;
        setLocationResults([]);
        setShowLocationResults(false);
        setLoadingLocations(false);
        return;
      }
      if (q.trim().length < 2) {
        if (!active) return;
        setLocationResults([]);
        setShowLocationResults(false);
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
  }, [debouncedPlanningLocation, isPlanningRound, planningLocationIsValidated]);

  useEffect(() => {
    let active = true;
    async function loadDefaultPlanningLocation() {
      try {
        const res = await fetch("/api/users/me");
        if (!res.ok) return;
        const json = (await res.json()) as MeResponse;
        const fallbackLocation =
          json.user.location?.trim() ?? json.user.homeCourse?.trim() ?? "";
        if (!active || !fallbackLocation) return;
        setPlanningLocation((prev) => (prev.trim().length > 0 ? prev : fallbackLocation));
        setPlanningLocationIsValidated(true);
      } catch {
        // Ignore profile preload failures on create page.
      }
    }
    void loadDefaultPlanningLocation();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const s = sessionFromUrl.trim();
    if (!s) return;
    const prev = prevSessionRef.current;
    if (prev === null) {
      prevSessionRef.current = s;
      return;
    }
    if (prev === s) return;
    prevSessionRef.current = s;

    setSelectedFriends([]);
    setTargetDate("");
    setPlanningLocation("");
    setPlanningLocationIsValidated(true);
    setLocationResults([]);
    setShowLocationResults(false);
    setPreferredTimeWindow("morning");
    setTeeDate("");
    setTeeTimePart("12:00");
    setQuery("");
    setResults([]);
    setSelectedCourse(null);
    setShowCourseResults(false);
    setTotalSpots(4);
    setVisibility("private");
    setJoinPolicy("instant");
    setSubmitting(false);
    setError(null);
    setCreatedInvitePath(null);
    setCreatedInvitedCount(0);
    setCustomImageUrl(null);
    setFriendQuery("");
    setFriendResults([]);
    setShowFriendResults(false);
  }, [sessionFromUrl]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (courseRef.current && !courseRef.current.contains(e.target as Node)) setShowCourseResults(false);
      if (friendRef.current && !friendRef.current.contains(e.target as Node)) setShowFriendResults(false);
      if (locationRef.current && !locationRef.current.contains(e.target as Node)) {
        setShowLocationResults(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function selectCourse(c: CourseResult) { setSelectedCourse(c); setQuery(c.name); setShowCourseResults(false); setResults([]); }
  function clearCourse() { setSelectedCourse(null); setQuery(""); setResults([]); }
  function addFriend(f: UserSearchResult) { if (!selectedFriends.some((s) => s.id === f.id)) { setSelectedFriends((p) => [...p, f]); setFriendResults((p) => p.filter((r) => r.id !== f.id)); } }
  function removeFriend(id: string) { setSelectedFriends((p) => p.filter((f) => f.id !== id)); }

  async function handleImageUpload(file: File | null) {
    if (!file) return;
    setUploadingImage(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/uploads/event-image", {
        method: "POST",
        body: formData,
      });
      const json = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !json.url) {
        throw new Error(json.error ?? "Failed to upload image.");
      }
      setCustomImageUrl(json.url);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "Failed to upload image.",
      );
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isPlanningRound && !selectedCourse) { setError("Select a course."); return; }
    if (isPlanningRound && !targetDate) { setError("Pick a target date."); return; }
    setSubmitting(true); setError(null); setCreatedInvitePath(null); setCreatedInvitedCount(0);
    try {
      const teeTimeIso =
        !isPlanningRound && teeDate && teeTimePart
          ? new Date(`${teeDate}T${teeTimePart}:00`).toISOString()
          : undefined;
      const res = await fetch("/api/rounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planningMode: isPlanningRound,
          preferredTimeWindow: isPlanningRound ? preferredTimeWindow : undefined,
          planningLocation: isPlanningRound ? planningLocation.trim() : undefined,
          courseId: isPlanningRound ? undefined : selectedCourse?.id,
          teeTime: isPlanningRound ? undefined : teeTimeIso,
          targetDate: isPlanningRound
            ? new Date(`${targetDate}T12:00:00`).toISOString()
            : undefined,
          totalSpots,
          visibility,
          joinPolicy,
          customImageUrl,
          inviteeUserIds: selectedFriends.map((f) => f.id),
        }),
      });
      const json = (await res.json()) as CreateRoundResponse & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed.");
      setCreatedInvitePath(json.invitePath);
      setCreatedInvitedCount(json.invitedCount);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed."); }
    finally { setSubmitting(false); }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-[#1c1c1e]">
          {isPlanningRound ? "Planning Round" : "Scheduled Tee Time"}
        </h1>
        <p className="mt-1 text-sm leading-snug text-[#6e6e6e]">
          {isPlanningRound
            ? "Find players first. Lock details later."
            : "Set it up. Blast invites. Tee off."}
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-2.5 rounded-[18px] border border-[#ece8e1] bg-white p-3 shadow-sm sm:p-3.5"
      >
        <div>
          <p className="parfade-label">Event image (optional)</p>
          <label className="parfade-input flex cursor-pointer items-center justify-between">
            <span className="inline-flex items-center gap-2 text-sm text-charcoal-400">
              {uploadingImage ? (
                <>
                  <ParfadeSpinner size="xs" variant="muted" aria-label="Uploading" />
                  Uploading…
                </>
              ) : (
                "Upload custom cover image"
              )}
            </span>
            <span className="text-xs font-semibold text-fairway">Choose file</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) =>
                void handleImageUpload(event.currentTarget.files?.[0] ?? null)
              }
            />
          </label>
          <p className="mt-2 text-xs text-charcoal-300">
            If you skip this, we&apos;ll try Google Places imagery first.
          </p>

          {customImageUrl && (
            <div className="mt-3">
              <Image
                src={customImageUrl}
                alt="Custom event cover"
                width={1200}
                height={700}
                className="h-36 w-full rounded-xl object-cover"
              />
              <button
                type="button"
                className="mt-2 text-xs font-medium text-charcoal-400 underline"
                onClick={() => setCustomImageUrl(null)}
              >
                Remove custom image
              </button>
            </div>
          )}
        </div>

        {isPlanningRound ? (
          <div>
            <p className="parfade-label">Target date</p>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="parfade-input"
              required
            />
            <p className="mt-2 text-xs text-charcoal-300">
              You can choose course and tee time after players join.
            </p>
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
                        <span className="block text-sm font-semibold text-charcoal">
                          {loc.label}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!planningLocationIsValidated && planningLocation.trim().length > 0 && (
                <p className="mt-2 text-xs text-charcoal-300">
                  Select a suggested city/state.
                </p>
              )}
            </div>
            <p className="parfade-label mt-3">Preferred time</p>
            <PlanningTimeWindowChipsWeb
              value={preferredTimeWindow}
              onChange={setPreferredTimeWindow}
            />
          </div>
        ) : (
          <>
            {/* Course */}
            <div ref={courseRef} className="relative">
              <p className="parfade-label">Course</p>
              <div className="relative">
                <input
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); if (selectedCourse) setSelectedCourse(null); }}
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
                      <button type="button" onClick={() => selectCourse(c)} className="w-full px-4 py-3 text-left transition hover:bg-cream-100">
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
                  <button type="button" onClick={clearCourse} className="text-xs font-medium text-fairway-400 hover:text-fairway">Change</button>
                </div>
              )}
            </div>

            {/* Tee time */}
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
            onChange={(e) =>
              setVisibility(e.target.value as "private" | "public")
            }
            className="parfade-select"
          >
            <option value="private">Invite only</option>
            <option value="public">Public</option>
          </select>
        </div>

        {/* Spots + settings */}
        <div>
          <p className="parfade-label">Looking for</p>
          <div className="flex gap-2">
            {([1, 2, 3] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setTotalSpots(n + 1)}
                className={`flex-1 rounded-xl py-3 text-sm font-semibold transition ${totalSpots === n + 1 ? "bg-fairway text-white" : "bg-[#edf4ef] text-[#6e6e6e] hover:bg-[#e2ebe4]"}`}
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

        {/* Friends */}
        <div ref={friendRef} className="relative">
          <p className="parfade-label">Invite friends</p>
          <input
            value={friendQuery}
            onChange={(e) => setFriendQuery(e.target.value)}
            onFocus={() => friendResults.length > 0 && setShowFriendResults(true)}
            className="parfade-input"
            placeholder="Name or email..."
          />
          {loadingFriends ? (
            <span className="absolute right-3.5 top-10 flex items-center">
              <ParfadeSpinner size="xs" variant="muted" aria-label="Searching friends" />
            </span>
          ) : null}

          {showFriendResults && friendResults.length > 0 && (
            <ul className="absolute z-20 mt-2 max-h-44 w-full overflow-auto rounded-2xl bg-white shadow-lg">
              {friendResults.map((f) => (
                <li key={f.id}>
                  <button type="button" onClick={() => addFriend(f)} className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-cream-100">
                    <span>
                      <span className="block text-sm font-semibold text-charcoal">{f.name}</span>
                      {f.email && <span className="block text-xs text-charcoal-300">{f.email}</span>}
                    </span>
                    <span className="text-xs font-semibold text-fairway">+ Add</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selectedFriends.length > 0 && (
          <div className="space-y-2">
            <p className="parfade-label">Invite blast ({selectedFriends.length})</p>
            {selectedFriends.map((f) => (
              <div key={f.id} className="flex items-center justify-between rounded-xl bg-cream-200 px-4 py-2.5">
                <span className="text-sm text-charcoal">{f.name}{f.email ? ` · ${f.email}` : ""}</span>
                <button type="button" onClick={() => removeFriend(f.id)} className="text-xs font-medium text-charcoal-300 hover:text-red-500 transition-colors">&times;</button>
              </div>
            ))}
          </div>
        )}

        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="parfade-btn-primary inline-flex w-full items-center justify-center gap-2 disabled:opacity-40"
        >
          {submitting ? (
            <>
              <ParfadeSpinner size="sm" variant="onPrimary" aria-label="Creating round" />
              Creating…
            </>
          ) : (
            "Create round"
          )}
        </button>
      </form>

      {createdInvitePath && (
        <div className="parfade-card space-y-2 border border-fairway-100 bg-fairway-50">
          <p className="font-semibold text-fairway">Round created</p>
          {createdInvitedCount > 0 && (
            <p className="text-sm text-charcoal-400">Blast sent to {createdInvitedCount} golfer{createdInvitedCount !== 1 ? "s" : ""}.</p>
          )}
          <a href={createdInvitePath} className="block text-sm font-medium text-fairway underline">{createdInvitePath}</a>
        </div>
      )}
    </section>
  );
}

export default function CreateRoundPage() {
  return (
    <Suspense fallback={<ParfadeLoadingBlock className="py-10" size="sm" />}>
      <CreateRoundPageInner />
    </Suspense>
  );
}
