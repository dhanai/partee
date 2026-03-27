"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import { ConfirmedSpotsRowWeb } from "@/components/confirmed-spots-row-web";
import { OpenInParfadeAppBar } from "@/components/open-in-parfade-app";
import { RoundDetailHostMenu } from "@/components/round-detail-host-menu";
import { ParfadeLoadingBlock, ParfadeSpinner } from "@/components/parfade-spinner";
import { PlanningRoundBadgeWeb } from "@/components/planning-round-badge-web";
type RoundPlayer = { id: string; name: string; avatar: string | null };

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
  confirmedPlayers: RoundPlayer[];
  declinedPlayers: RoundPlayer[];
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
    if (!value) return "time TBD";
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
  const [browserUrl, setBrowserUrl] = useState("");

  useEffect(() => {
    setBrowserUrl(typeof window !== "undefined" ? window.location.href : "");
  }, []);

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
    try {
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
        await loadRound();
      }
    } finally {
      setRsvpBusy(false);
    }
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
    return <p className="parfade-card text-sm text-red-600">{error}</p>;
  }

  if (!round) {
    return (
      <ParfadeLoadingBlock className="py-12" message="Loading round…" size="md" />
    );
  }

  const hasResponded = round.currentUserSpotStatus !== null;
  const isFull = round.spotsRemaining <= 0;
  const confirmedPlayers = round.confirmedPlayers ?? [];
  const declinedPlayers = round.declinedPlayers ?? [];
  return (
    <section className="space-y-5">
      <RoundDetailHostMenu inviteToken={params.token} isHost={round.isHost} />
      <OpenInParfadeAppBar inviteToken={params.token} browserUrl={browserUrl} />

      <div className="space-y-2">
        {round.mode === "scheduled" ? (
          <div className="relative h-[180px] w-full overflow-hidden rounded-2xl bg-[#e9e5de]">
            <Image
              src={round.imageUrl}
              alt={round.courseName ?? "Round image"}
              fill
              className="object-cover"
              sizes="100vw"
              priority
            />
          </div>
        ) : null}

        {round.mode === "planning" ? (
          <PlanningRoundBadgeWeb preferredTimeWindow={round.preferredTimeWindow} compact />
        ) : null}

        {round.mode === "planning" ? (
          <h1 className="mt-2 text-[28px] font-bold leading-tight text-[#1c1c1e]">
            {new Date(round.targetDate).toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </h1>
        ) : (
          <h1 className="mt-2 text-[28px] font-bold leading-tight text-[#1c1c1e]">
            {round.courseName}
          </h1>
        )}

        {round.mode === "planning" ? (
          <div className="space-y-0.5">
            <p className="text-lg font-bold text-[#1c1c1e]">
              {formatPlanningWindow(round.preferredTimeWindow)}
            </p>
            {round.planningLocation?.trim() ? (
              <p className="text-base font-semibold text-[#6e6e6e]">
                {round.planningLocation.trim()}
              </p>
            ) : null}
          </div>
        ) : null}

        {round.mode === "scheduled" ? (
          <div className="space-y-0.5">
            <p className="text-lg font-bold text-[#1c1c1e]">
              {new Date(round.teeTime as string).toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
            </p>
            <p className="text-base font-semibold text-[#6e6e6e]">
              {new Date(round.teeTime as string).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          </div>
        ) : null}

        <div className="mt-3">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.06em] text-[#6e6e6e]">
            Claimed {confirmedPlayers.length}/{round.totalSpots}
          </p>
          <ConfirmedSpotsRowWeb
            roundId={round.id}
            totalSpots={round.totalSpots}
            players={confirmedPlayers}
            size="md"
            initialTone="muted"
          />
        </div>

        {declinedPlayers.length > 0 ? (
          <div className="mt-2">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.06em] text-[#6e6e6e]">
              Declined
            </p>
            <div className="flex flex-wrap gap-2">
              {declinedPlayers.map((player) => (
                <div
                  key={player.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#ece8e1] bg-[#f5f3ef] px-2 py-1.5"
                >
                  {player.avatar ? (
                    <Image
                      src={player.avatar}
                      alt=""
                      width={22}
                      height={22}
                      className="rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-[22px] w-[22px] items-center justify-center rounded-full border border-[#ece8e1] bg-[#f1efea] text-[11px] font-bold text-[#6e6e6e]">
                      {player.name.trim().charAt(0).toUpperCase() || "?"}
                    </div>
                  )}
                  <span className="max-w-[140px] truncate text-xs font-semibold text-[#6e6e6e]">
                    {player.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <SignedIn>
        <div className="flex items-center gap-3 rounded-xl border border-[#ece8e1] bg-white p-3 shadow-sm">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#edf4ef] text-[#1a3c2a]">
            <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M8 10h8M8 14h5M6 4h12a2 2 0 012 2v8a2 2 0 01-2 2h-4l-4 3v-3H6a2 2 0 01-2-2V6a2 2 0 012-2z"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold text-[#1c1c1e]">Group chat</p>
            <p className="text-[13px] leading-snug text-[#6e6e6e]">
              Open the Parfade app to chat with your group.
            </p>
          </div>
        </div>
      </SignedIn>

      {round.isHost && (
        <div className="parfade-card border-[#dce8df] bg-[#edf4ef]">
          <p className="font-semibold text-[#1a3c2a]">You&apos;re hosting</p>
          <p className="mt-1 text-sm text-[#6e6e6e]">
            {round.mode === "planning"
              ? "Share now, then finalize course and tee time once your group is in."
              : "Share the link to invite more players."}
          </p>
          <div className="mt-3 rounded-xl border border-[#ece8e1] bg-white px-4 py-2.5">
            <p className="text-xs font-medium text-[#6e6e6e] select-all break-all">
              {typeof window !== "undefined" ? window.location.href : `/round/${round.inviteToken}`}
            </p>
          </div>

          {round.mode === "planning" && (
            <div className="mt-4 space-y-3 rounded-xl border border-[#ece8e1] bg-white p-4">
              <p className="text-sm font-semibold text-charcoal">Finalize details</p>

              <div ref={finalizeDropdownRef} className="relative">
                <input
                  value={finalizeQuery}
                  onChange={(e) => {
                    setFinalizeQuery(e.target.value);
                    setSelectedFinalizeCourse(null);
                  }}
                  onFocus={() => finalizeResults.length > 0 && setShowFinalizeResults(true)}
                  className="parfade-input"
                  placeholder="Search golf course..."
                />
                {loadingFinalizeCourses ? (
                  <span className="absolute right-3.5 top-3 flex items-center">
                    <ParfadeSpinner size="xs" variant="muted" aria-label="Searching courses" />
                  </span>
                ) : null}

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
                className="parfade-input"
              />

              {finalizeError && <p className="text-sm text-red-600">{finalizeError}</p>}

              <button
                type="button"
                onClick={() => void finalizeRound()}
                disabled={finalizing}
                className="parfade-btn-primary inline-flex w-full items-center justify-center gap-2 disabled:opacity-40"
              >
                {finalizing ? (
                  <>
                    <ParfadeSpinner size="sm" variant="onPrimary" aria-label="Finalizing" />
                    Finalizing…
                  </>
                ) : (
                  "Finalize round"
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {!round.isHost && (
        <>
          <SignedOut>
            <div className="parfade-card text-center">
              <p className="text-sm text-charcoal-400">Sign in to RSVP for this round.</p>
              <SignInButton mode="modal">
                <button className="parfade-btn-primary mt-4">Sign in</button>
              </SignInButton>
            </div>
          </SignedOut>

          <SignedIn>
            <div className="parfade-card">
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
                    <button
                      onClick={() => rsvp("claim")}
                      disabled={rsvpBusy}
                      className="parfade-btn-primary inline-flex flex-1 items-center justify-center gap-2 disabled:opacity-40"
                    >
                      {rsvpBusy ? (
                        <>
                          <ParfadeSpinner size="sm" variant="onPrimary" aria-label="Updating" />
                          Updating…
                        </>
                      ) : round.mode === "planning" ? (
                        "I'm in"
                      ) : round.joinPolicy === "approval" ? (
                        "Request to join"
                      ) : (
                        "Claim spot"
                      )}
                    </button>
                  )}
                  {isFull && !hasResponded && (
                    <p className="text-sm text-charcoal-300">This round is full.</p>
                  )}
                  {round.currentUserSpotStatus !== "declined" && (
                    <button onClick={() => rsvp("decline")} disabled={rsvpBusy} className="parfade-btn-secondary flex-1 disabled:opacity-40">
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
