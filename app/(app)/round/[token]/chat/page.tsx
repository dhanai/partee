"use client";

import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ParfadeLoadingBlock } from "@/components/parfade-spinner";
import { RoundChatPanel } from "../round-chat-panel";

type ChatRoundMeta = {
  courseName: string;
  isHost: boolean;
  currentUserSpotStatus: string | null;
};

export default function RoundChatPage({ params }: { params: { token: string } }) {
  const [round, setRound] = useState<ChatRoundMeta | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/rounds/${params.token}`);
    const json = (await res.json()) as { round?: ChatRoundMeta; error?: string };
    if (!res.ok) {
      setLoadError(json.error ?? "Round not found.");
      return;
    }
    setRound(json.round ?? null);
  }, [params.token]);

  useEffect(() => {
    void load();
  }, [load]);

  const canUse =
    round != null && (round.isHost || round.currentUserSpotStatus === "confirmed");

  /** Tab bar is hidden on this route; reserve header + main top padding + home indicator only. */
  const chatShellMinHeight =
    "calc(100dvh - 52px - 1rem - env(safe-area-inset-bottom, 0px))";

  return (
    <section
      className={
        canUse && round
          ? "flex min-h-0 flex-col gap-0"
          : "space-y-5 pb-[max(1rem,env(safe-area-inset-bottom,0px))]"
      }
      style={
        canUse && round
          ? { minHeight: chatShellMinHeight }
          : undefined
      }
    >
      {loadError ? (
        <>
          <Link
            href={`/round/${params.token}`}
            className="inline-flex items-center gap-1 text-sm font-semibold text-[#1a3c2a]"
          >
            <span aria-hidden>&larr;</span> Back to round
          </Link>
          <p className="parfade-card text-sm text-red-600">{loadError}</p>
        </>
      ) : !round ? (
        <>
          <Link
            href={`/round/${params.token}`}
            className="inline-flex items-center gap-1 text-sm font-semibold text-[#1a3c2a]"
          >
            <span aria-hidden>&larr;</span> Back to round
          </Link>
          <ParfadeLoadingBlock className="py-12" message="Loading…" size="md" />
        </>
      ) : canUse ? (
        <>
          <header className="mb-2 shrink-0 border-b border-[#ece8e1] pb-3">
            <Link
              href={`/round/${params.token}`}
              className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-[#1a3c2a]"
            >
              <span aria-hidden>&larr;</span> Round
            </Link>
            <h1 className="text-lg font-bold leading-tight text-[#1c1c1e]">Group chat</h1>
            <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-[#6e6e6e]">
              {round.courseName ? `${round.courseName} · ` : null}
              Host and confirmed players only.
            </p>
          </header>

          <SignedOut>
            <div className="parfade-card mt-2 text-center">
              <p className="text-sm text-charcoal-400">Sign in to open group chat.</p>
              <SignInButton mode="modal">
                <button type="button" className="parfade-btn-primary mt-4">
                  Sign in
                </button>
              </SignInButton>
            </div>
          </SignedOut>

          <SignedIn>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <RoundChatPanel inviteToken={params.token} variant="page" />
            </div>
          </SignedIn>
        </>
      ) : (
        <>
          <Link
            href={`/round/${params.token}`}
            className="inline-flex items-center gap-1 text-sm font-semibold text-[#1a3c2a]"
          >
            <span aria-hidden>&larr;</span> Back to round
          </Link>

          <header>
            <h1 className="text-[28px] font-bold leading-tight text-[#1c1c1e]">Group chat</h1>
            <p className="mt-1 text-sm text-[#6e6e6e]">
              {round.courseName ? `${round.courseName} · ` : null}
              Host and confirmed players only.
            </p>
          </header>

          <SignedOut>
            <div className="parfade-card text-center">
              <p className="text-sm text-charcoal-400">Sign in to open group chat.</p>
              <SignInButton mode="modal">
                <button type="button" className="parfade-btn-primary mt-4">
                  Sign in
                </button>
              </SignInButton>
            </div>
          </SignedOut>

          <SignedIn>
            <div className="rounded-2xl border border-[#ece8e1] bg-[#faf8f5] px-4 py-3 text-sm text-[#6e6e6e]">
              Group chat is for the host and players who have claimed a spot.
            </div>
          </SignedIn>
        </>
      )}
    </section>
  );
}
