"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

type CourseResult = { id: string; name: string; address: string };
type UserSearchResult = { id: string; name: string; email: string | null; avatar: string | null };
type CreateRoundResponse = { round: { id: string; inviteToken: string }; invitePath: string; invitedCount: number };

function useDebounce(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export default function CreateRoundPage() {
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

  const [teeTime, setTeeTime] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [planningMode, setPlanningMode] = useState(false);
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
  const canSubmit = useMemo(
    () =>
      planningMode
        ? Boolean(targetDate && !submitting && !uploadingImage)
        : Boolean(selectedCourse && teeTime && !submitting && !uploadingImage),
    [planningMode, selectedCourse, teeTime, targetDate, submitting, uploadingImage],
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
    function onClick(e: MouseEvent) {
      if (courseRef.current && !courseRef.current.contains(e.target as Node)) setShowCourseResults(false);
      if (friendRef.current && !friendRef.current.contains(e.target as Node)) setShowFriendResults(false);
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
    if (!planningMode && !selectedCourse) { setError("Select a course."); return; }
    if (planningMode && !targetDate) { setError("Pick a target date."); return; }
    setSubmitting(true); setError(null); setCreatedInvitePath(null); setCreatedInvitedCount(0);
    try {
      const res = await fetch("/api/rounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planningMode,
          preferredTimeWindow: planningMode ? preferredTimeWindow : undefined,
          courseId: planningMode ? undefined : selectedCourse?.id,
          teeTime: planningMode ? undefined : new Date(teeTime).toISOString(),
          targetDate: planningMode
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
        <h1 className="text-2xl font-bold tracking-tightest text-charcoal">New round</h1>
        <p className="mt-1 text-sm text-charcoal-400">Set it up. Blast invites. Tee off.</p>
      </div>

      <form onSubmit={handleSubmit} className="partee-card space-y-5">
        <div>
          <p className="partee-label">Flow</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPlanningMode(true)}
              className={`rounded-xl py-2.5 text-sm font-semibold transition ${
                planningMode
                  ? "bg-fairway text-white"
                  : "bg-cream-200 text-charcoal-400 hover:bg-cream-300"
              }`}
            >
              Plan first
            </button>
            <button
              type="button"
              onClick={() => setPlanningMode(false)}
              className={`rounded-xl py-2.5 text-sm font-semibold transition ${
                !planningMode
                  ? "bg-fairway text-white"
                  : "bg-cream-200 text-charcoal-400 hover:bg-cream-300"
              }`}
            >
              Set details now
            </button>
          </div>
        </div>

        <div>
          <p className="partee-label">Event image (optional)</p>
          <label className="partee-input flex cursor-pointer items-center justify-between">
            <span className="text-sm text-charcoal-400">
              {uploadingImage ? "Uploading..." : "Upload custom cover image"}
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

        {planningMode ? (
          <div>
            <p className="partee-label">Target date</p>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="partee-input"
              required
            />
            <p className="mt-2 text-xs text-charcoal-300">
              You can choose course and tee time after players join.
            </p>
            <p className="partee-label mt-3">Preferred time</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "morning", label: "Morning" },
                { value: "afternoon", label: "Afternoon" },
                { value: "twilight", label: "Twilight" },
              ].map((slot) => (
                <button
                  key={slot.value}
                  type="button"
                  onClick={() =>
                    setPreferredTimeWindow(
                      slot.value as "morning" | "afternoon" | "twilight",
                    )
                  }
                  className={`rounded-xl py-2.5 text-sm font-semibold transition ${
                    preferredTimeWindow === slot.value
                      ? "bg-fairway text-white"
                      : "bg-cream-200 text-charcoal-400 hover:bg-cream-300"
                  }`}
                >
                  {slot.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Course */}
            <div ref={courseRef} className="relative">
              <p className="partee-label">Course</p>
              <div className="relative">
                <input
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); if (selectedCourse) setSelectedCourse(null); }}
                  onFocus={() => results.length > 0 && setShowCourseResults(true)}
                  className="partee-input"
                  placeholder="Search golf courses..."
                />
                {loadingCourses && <span className="absolute right-4 top-3.5 text-xs text-charcoal-300">Searching...</span>}
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
              <p className="partee-label">Tee time</p>
              <input type="datetime-local" value={teeTime} onChange={(e) => setTeeTime(e.target.value)} className="partee-input" required />
            </div>
          </>
        )}

        {/* Friends */}
        <div ref={friendRef} className="relative">
          <p className="partee-label">Invite friends</p>
          <input
            value={friendQuery}
            onChange={(e) => setFriendQuery(e.target.value)}
            onFocus={() => friendResults.length > 0 && setShowFriendResults(true)}
            className="partee-input"
            placeholder="Name or email..."
          />
          {loadingFriends && <span className="absolute right-4 top-10 text-xs text-charcoal-300">Searching...</span>}

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
            <p className="partee-label">Invite blast ({selectedFriends.length})</p>
            {selectedFriends.map((f) => (
              <div key={f.id} className="flex items-center justify-between rounded-xl bg-cream-200 px-4 py-2.5">
                <span className="text-sm text-charcoal">{f.name}{f.email ? ` · ${f.email}` : ""}</span>
                <button type="button" onClick={() => removeFriend(f.id)} className="text-xs font-medium text-charcoal-300 hover:text-red-500 transition-colors">&times;</button>
              </div>
            ))}
          </div>
        )}

        {/* Spots + settings */}
        <div>
          <p className="partee-label">Spots</p>
          <div className="flex gap-2">
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setTotalSpots(n)}
                className={`flex-1 rounded-xl py-3 text-sm font-semibold transition ${totalSpots === n ? "bg-fairway text-white" : "bg-cream-200 text-charcoal-400 hover:bg-cream-300"}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="partee-label">Visibility</p>
            <select value={visibility} onChange={(e) => setVisibility(e.target.value as "private" | "public")} className="partee-select">
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
          </div>
          <div>
            <p className="partee-label">Join policy</p>
            <select value={joinPolicy} onChange={(e) => setJoinPolicy(e.target.value as "instant" | "approval")} className="partee-select">
              <option value="instant">Instant</option>
              <option value="approval">Approval</option>
            </select>
          </div>
        </div>

        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

        <button type="submit" disabled={!canSubmit} className="partee-btn-primary w-full disabled:opacity-40">
          {submitting ? "Creating..." : "Create round"}
        </button>
      </form>

      {createdInvitePath && (
        <div className="partee-card space-y-2 border border-fairway-100 bg-fairway-50">
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
