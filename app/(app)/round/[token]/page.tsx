"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import { RoundChatPanel } from "./round-chat-panel";

type RoundDetails = {
  id: string;
  inviteToken: string;
  mode: "scheduled" | "planning";
  preferredTimeWindow: "morning" | "afternoon" | "twilight" | null;
  planningLocation: string | null;
  courseName: string;
  teeTime: string | null;
  targetDate: string;
  visibility: "private" | "public";
  totalSpots: number;
  status: "forming" | "confirmed" | "completed";
  joinPolicy: "instant" | "approval";
  hostName: string;
  hostAvatar: string | null;
  imageUrl: string;
  confirmedCount: number;
  spotsRemaining: number;
  isHost: boolean;
  currentUserSpotStatus: string | null;
};

type CourseSearchResult = {
  id: string;
  name: string;
  address: string;
};

function useDebounce(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function toDateTimeLocalValue(input: string) {
  const date = new Date(input);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function RoundInvitePage({
  params,
}: {
  params: { token: string };
}) {
  function formatPlanningWindow(
    value: "morning" | "afternoon" | "twilight" | null | undefined,
  ) {
    if (!value) return "Time TBD";
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  const [round, setRound] = useState<RoundDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rsvpBusy, setRsvpBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [finalizeQuery, setFinalizeQuery] = useState("");
  const [finalizeResults, setFinalizeResults] = useState<CourseSearchResult[]>([]);
  const [showFinalizeResults, setShowFinalizeResults] = useState(false);
  const [selectedFinalizeCourse, setSelectedFinalizeCourse] =
    useState<CourseSearchResult | null>(null);
  const [finalizeTeeTime, setFinalizeTeeTime] = useState("");
  const [loadingFinalizeCourses, setLoadingFinalizeCourses] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const finalizeDropdownRef = useRef<HTMLDivElement>(null);
  const debouncedFinalizeQuery = useDebounce(finalizeQuery, 300);

  const loadRound = useCallback(async () => {
    const response = await fetch(`/api/rounds/${params.token}`);
    const json = (await response.json()) as { round?: RoundDetails; error?: string };
    if (!response.ok) {
      setError(json.error ?? "Round not found.");
      return;
    }
    setRound(json.round ?? null);
    if (json.round?.mode === "planning") {
      setFinalizeTeeTime(toDateTimeLocalValue(json.round.targetDate));
    }
  }, [params.token]);

  useEffect(() => {
    void loadRound();
  }, [loadRound]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        finalizeDropdownRef.current &&
        !finalizeDropdownRef.current.contains(e.target as Node)
      ) {
        setShowFinalizeResults(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const searchFinalizeCourses = useCallback(async (q: string) => {
    if (!round || round.mode !== "planning") return;
    if (q.trim().length < 2) {
      setFinalizeResults([]);
      return;
    }

    setLoadingFinalizeCourses(true);
    try {
      const res = await fetch("/api/courses/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const json = (await res.json()) as {
        courses: CourseSearchResult[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Failed to search courses.");
      setFinalizeResults(json.courses);
      setShowFinalizeResults(true);
    } catch (searchError) {
      setFinalizeError(
        searchError instanceof Error ? searchError.message : "Search failed.",
      );
    } finally {
      setLoadingFinalizeCourses(false);
    }
  }, [round]);

  useEffect(() => {
    void searchFinalizeCourses(debouncedFinalizeQuery);
  }, [debouncedFinalizeQuery, searchFinalizeCourses]);

  async function rsvp(action: "claim" | "decline") {
    setRsvpBusy(true);
    setMessage(null);
    setError(null);
    const response = await fetch(`/api/rounds/${params.token}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const json = (await response.json()) as { ok?: boolean; status?: string; error?: string };
    if (!response.ok) {
      setError(json.error ?? "Unable to update RSVP.");
    } else {
      setMessage(
        json.status === "confirmed"
          ? "You're in! Spot confirmed."
          : json.status === "declined"
            ? "You've declined this round."
            : json.status === "requested"
              ? "Request sent — waiting for host approval."
              : `RSVP saved as "${json.status}".`,
      );
      if (round) {
        setRound({
          ...round,
          currentUserSpotStatus: json.status ?? null,
          confirmedCount: json.status === "confirmed" ? round.confirmedCount + 1 : round.confirmedCount,
          spotsRemaining: json.status === "confirmed" ? Math.max(0, round.spotsRemaining - 1) : round.spotsRemaining,
        });
      }
    }
    setRsvpBusy(false);
  }

  async function finalizeRound() {
    if (!selectedFinalizeCourse) {
      setFinalizeError("Select a course first.");
      return;
    }
    if (!finalizeTeeTime) {
      setFinalizeError("Select tee time.");
      return;
    }

    setFinalizing(true);
    setFinalizeError(null);
    setMessage(null);
    setError(null);

    const response = await fetch(`/api/rounds/${params.token}/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseId: selectedFinalizeCourse.id,
        teeTime: new Date(finalizeTeeTime).toISOString(),
      }),
    });
    const json = (await response.json()) as { error?: string };

    if (!response.ok) {
      setFinalizeError(json.error ?? "Unable to finalize round.");
      setFinalizing(false);
      return;
    }

    await loadRound();
    setMessage("Round finalized. Everyone can now see the course and tee time.");
    setFinalizing(false);
  }

  if (error && !round) {
    return <p className="partee-card text-sm text-red-600">{error}</p>;
  }

  if (!round) {
    return <p className="text-sm text-charcoal-300">Loading round...</p>;
  }

  const hasResponded = round.currentUserSpotStatus !== null;
  const isFull = round.spotsRemaining <= 0;
  const spotsArray = Array.from({ length: round.totalSpots }, (_, i) => i < round.confirmedCount);

  return (
    <section className="space-y-4">
      <div className="partee-card">
        <Image
          src={round.imageUrl}
          alt={round.courseName ?? "Round image"}
          width={1200}
          height={700}
          className="h-44 w-full rounded-2xl object-cover"
        />
        <p className="partee-label mt-4">Round invite</p>
        <h1 className="text-2xl font-bold tracking-tightest text-charcoal">{round.courseName}</h1>

        <div className="mt-4 flex items-center gap-3">
          {round.hostAvatar && (
            <Image src={round.hostAvatar} alt={round.hostName} width={32} height={32} className="rounded-full" />
          )}
          <div>
            <p className="text-sm font-semibold text-charcoal">{round.hostName}</p>
            <p className="text-xs text-charcoal-300">Host</p>
          </div>
        </div>

        <div className="mt-4 flex gap-6">
          <div>
            <p className="partee-label">Date</p>
            <p className="text-sm font-medium text-charcoal">
              {new Date(round.teeTime ?? round.targetDate).toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </p>
          </div>
          <div>
            <p className="partee-label">{round.mode === "planning" ? "Status" : "Tee time"}</p>
            <p className="text-sm font-medium text-charcoal">
              {round.mode === "planning"
                ? formatPlanningWindow(round.preferredTimeWindow)
                : new Date(round.teeTime as string).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
            </p>
            {round.mode === "planning" && round.planningLocation ? (
              <p className="mt-1 text-xs text-charcoal-300">{round.planningLocation}</p>
            ) : null}
          </div>
        </div>

        {/* Spots visual */}
        <div className="mt-5">
          <p className="partee-label">Spots</p>
          <div className="flex gap-2">
            {spotsArray.map((filled, i) => (
              <div
                key={i}
                className={`h-10 flex-1 rounded-lg transition-colors ${
                  filled ? "bg-fairway" : "bg-cream-200"
                }`}
              />
            ))}
          </div>
          <p className="mt-1.5 text-xs text-charcoal-300">
            {round.confirmedCount}/{round.totalSpots} confirmed &middot; {round.spotsRemaining} open
          </p>
        </div>
      </div>

      <SignedIn>
        {round.isHost || round.currentUserSpotStatus === "confirmed" ? (
          <RoundChatPanel inviteToken={params.token} />
        ) : (
          <div className="rounded-2xl border border-cream-200 bg-cream-50 px-4 py-3 text-sm text-charcoal-400">
            Group chat is for the host and players who have claimed a spot.
          </div>
        )}
      </SignedIn>

      {round.isHost && (
        <div className="partee-card border border-fairway-100 bg-fairway-50">
          <p className="font-semibold text-fairway">You&apos;re hosting</p>
          <p className="mt-1 text-sm text-charcoal-400">
            {round.mode === "planning"
              ? "Share now, then finalize course and tee time once your group is in."
              : "Share the link to invite more players."}
          </p>
          <div className="mt-3 rounded-xl bg-white px-4 py-2.5">
            <p className="text-xs font-medium text-charcoal-300 select-all break-all">
              {typeof window !== "undefined" ? window.location.href : `/round/${round.inviteToken}`}
            </p>
          </div>

          {round.mode === "planning" && (
            <div className="mt-4 space-y-3 rounded-xl border border-fairway-100 bg-white p-4">
              <p className="text-sm font-semibold text-charcoal">Finalize details</p>

              <div ref={finalizeDropdownRef} className="relative">
                <input
                  value={finalizeQuery}
                  onChange={(e) => {
                    setFinalizeQuery(e.target.value);
                    setSelectedFinalizeCourse(null);
                  }}
                  onFocus={() => finalizeResults.length > 0 && setShowFinalizeResults(true)}
                  className="partee-input"
                  placeholder="Search golf course..."
                />
                {loadingFinalizeCourses && (
                  <span className="absolute right-4 top-3.5 text-xs text-charcoal-300">
                    Searching...
                  </span>
                )}

                {showFinalizeResults && finalizeResults.length > 0 && (
                  <ul className="absolute z-20 mt-2 max-h-52 w-full overflow-auto rounded-2xl bg-white shadow-lg">
                    {finalizeResults.map((course) => (
                      <li key={course.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFinalizeCourse(course);
                            setFinalizeQuery(course.name);
                            setShowFinalizeResults(false);
                          }}
                          className="w-full px-4 py-3 text-left transition hover:bg-cream-100"
                        >
                          <span className="block text-sm font-semibold text-charcoal">
                            {course.name}
                          </span>
                          <span className="block text-xs text-charcoal-300">
                            {course.address}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <input
                type="datetime-local"
                value={finalizeTeeTime}
                onChange={(e) => setFinalizeTeeTime(e.target.value)}
                className="partee-input"
              />

              {finalizeError && <p className="text-sm text-red-600">{finalizeError}</p>}

              <button
                type="button"
                onClick={() => void finalizeRound()}
                disabled={finalizing}
                className="partee-btn-primary w-full disabled:opacity-40"
              >
                {finalizing ? "Finalizing..." : "Finalize round"}
              </button>
            </div>
          )}
        </div>
      )}

      {!round.isHost && (
        <>
          <SignedOut>
            <div className="partee-card text-center">
              <p className="text-sm text-charcoal-400">Sign in to RSVP for this round.</p>
              <SignInButton mode="modal">
                <button className="partee-btn-primary mt-4">Sign in</button>
              </SignInButton>
            </div>
          </SignedOut>

          <SignedIn>
            <div className="partee-card">
              {hasResponded && !message ? (
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${round.currentUserSpotStatus === "confirmed" ? "bg-fairway" : round.currentUserSpotStatus === "declined" ? "bg-red-400" : "bg-gold"}`} />
                  <p className="text-sm text-charcoal-400">
                    Status: <span className="font-semibold text-charcoal">{round.currentUserSpotStatus}</span>
                  </p>
                </div>
              ) : null}

              {message && <p className="text-sm font-medium text-fairway">{message}</p>}
              {error && <p className="text-sm text-red-600">{error}</p>}

              {(!hasResponded || round.currentUserSpotStatus === "invited" || round.currentUserSpotStatus === "declined") && (
                <div className={`flex gap-3 ${message || error ? "mt-4" : ""}`}>
                  {!isFull && (
                    <button onClick={() => rsvp("claim")} disabled={rsvpBusy} className="partee-btn-primary flex-1 disabled:opacity-40">
                      {rsvpBusy
                        ? "Updating..."
                        : round.mode === "planning"
                          ? "I'm in"
                          : round.joinPolicy === "approval"
                            ? "Request to join"
                            : "Claim spot"}
                    </button>
                  )}
                  {isFull && !hasResponded && (
                    <p className="text-sm text-charcoal-300">This round is full.</p>
                  )}
                  {round.currentUserSpotStatus !== "declined" && (
                    <button onClick={() => rsvp("decline")} disabled={rsvpBusy} className="partee-btn-secondary flex-1 disabled:opacity-40">
                      Decline
                    </button>
                  )}
                </div>
              )}

              {round.currentUserSpotStatus === "confirmed" && !message && (
                <p className="text-sm font-semibold text-fairway">You&apos;re in! Spot confirmed.</p>
              )}
            </div>
          </SignedIn>
        </>
      )}
    </section>
  );
}
