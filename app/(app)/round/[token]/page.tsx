"use client";

import { useEffect, useState } from "react";
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
  confirmedCount: number;
  spotsRemaining: number;
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
      setMessage(`RSVP saved as "${json.status}".`);
    }
    setBusy(false);
  }

  if (error && !round) {
    return <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>;
  }

  if (!round) {
    return <p className="text-sm text-slate-600">Loading round...</p>;
  }

  return (
    <section className="mx-auto max-w-xl space-y-4">
      <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <h1 className="text-xl font-semibold text-fairway">{round.courseName}</h1>
        <p className="mt-1 text-sm text-slate-600">
          Hosted by {round.hostName} - {new Date(round.teeTime).toLocaleString()}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          {round.spotsRemaining} spots remaining ({round.confirmedCount}/{round.totalSpots})
        </p>
      </div>

      <SignedOut>
        <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
          <p className="text-sm text-slate-600">Sign in to RSVP for this round.</p>
          <SignInButton mode="modal">
            <button className="mt-3 rounded-lg bg-fairway px-4 py-2 text-sm font-medium text-white">
              Sign in
            </button>
          </SignInButton>
        </div>
      </SignedOut>

      <SignedIn>
        <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
          <div className="flex gap-3">
            <button
              onClick={() => rsvp("claim")}
              disabled={busy}
              className="rounded-lg bg-putting px-4 py-2 text-sm font-medium text-white"
            >
              {round.joinPolicy === "approval" ? "Request to join" : "Claim spot"}
            </button>
            <button
              onClick={() => rsvp("decline")}
              disabled={busy}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
            >
              Decline
            </button>
          </div>
          {message && <p className="mt-3 text-sm text-emerald-700">{message}</p>}
          {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
        </div>
      </SignedIn>
    </section>
  );
}
