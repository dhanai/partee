"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";

type RoundDetails = {
  id: string;
  inviteToken: string;
  courseName: string;
  teeTime: string;
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

export default function RoundInvitePage({
  params,
}: {
  params: { token: string };
}) {
  const [round, setRound] = useState<RoundDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadRound() {
      const response = await fetch(`/api/rounds/${params.token}`);
      const json = (await response.json()) as { round?: RoundDetails; error?: string };
      if (!response.ok) {
        setError(json.error ?? "Round not found.");
        return;
      }
      setRound(json.round ?? null);
    }
    void loadRound();
  }, [params.token]);

  async function rsvp(action: "claim" | "decline") {
    setBusy(true);
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
    setBusy(false);
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
          alt={round.courseName}
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
              {new Date(round.teeTime).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </p>
          </div>
          <div>
            <p className="partee-label">Tee time</p>
            <p className="text-sm font-medium text-charcoal">
              {new Date(round.teeTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </p>
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

      {round.isHost && (
        <div className="partee-card border border-fairway-100 bg-fairway-50">
          <p className="font-semibold text-fairway">You&apos;re hosting</p>
          <p className="mt-1 text-sm text-charcoal-400">Share the link to invite more players.</p>
          <div className="mt-3 rounded-xl bg-white px-4 py-2.5">
            <p className="text-xs font-medium text-charcoal-300 select-all break-all">
              {typeof window !== "undefined" ? window.location.href : `/round/${round.inviteToken}`}
            </p>
          </div>
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
                    <button onClick={() => rsvp("claim")} disabled={busy} className="partee-btn-primary flex-1 disabled:opacity-40">
                      {busy ? "Updating..." : round.joinPolicy === "approval" ? "Request to join" : "Claim spot"}
                    </button>
                  )}
                  {isFull && !hasResponded && (
                    <p className="text-sm text-charcoal-300">This round is full.</p>
                  )}
                  {round.currentUserSpotStatus !== "declined" && (
                    <button onClick={() => rsvp("decline")} disabled={busy} className="partee-btn-secondary flex-1 disabled:opacity-40">
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
