"use client";

import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAppHeaderActions } from "@/components/app-header-actions-context";
import { ParfadeLoadingBlock } from "@/components/parfade-spinner";
import { RoundChatPanel } from "../round-chat-panel";

type ChatRoundMeta = {
  courseName: string;
  isHost: boolean;
  currentUserSpotStatus: string | null;
};

export default function RoundChatPage({ params }: { params: { token: string } }) {
  const { setHeaderActions } = useAppHeaderActions();
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

  useEffect(() => {
    if (!canUse) return;
    const markRead = () =>
      fetch("/api/rounds/chats/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteToken: params.token }),
      }).catch(() => {});
    void markRead();
    return () => void markRead();
  }, [canUse, params.token]);

  const canUse =
    round != null && (round.isHost || round.currentUserSpotStatus === "confirmed");

  useEffect(() => {
    if (!canUse || !round) {
      setHeaderActions(
        <Link
          href={`/round/${params.token}`}
          className="inline-flex items-center gap-1 text-sm font-semibold text-[#1a3c2a]"
          aria-label="Back to round"
        >
          <span aria-hidden>&larr;</span> Round
        </Link>,
      );
      return () => setHeaderActions(null);
    }

    setHeaderActions(
      <div className="flex min-w-0 items-center gap-2">
        <Link
          href={`/round/${params.token}`}
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border border-[#ece8e1] bg-white text-[#1a3c2a] shadow-sm transition hover:bg-[#faf8f5] active:opacity-90"
          aria-label="Back to round"
        >
          <span aria-hidden>&larr;</span>
        </Link>
        <div className="min-w-0 text-right leading-tight">
          <p className="truncate text-xs font-bold text-[#1c1c1e]">Group chat</p>
          <p className="truncate text-[11px] text-[#6e6e6e]">
            {round.courseName ? `${round.courseName} · ` : ""}
            Host + confirmed
          </p>
        </div>
      </div>,
    );
    return () => setHeaderActions(null);
  }, [canUse, params.token, round, setHeaderActions]);

  /** Tab bar is hidden on this route; reserve header + main top padding + home indicator only. */
  const chatShellMinHeight =
    "calc(100dvh - 52px - 1rem - env(safe-area-inset-bottom, 0px))";

  return (
    <section
      className={
        canUse && round
          ? "flex min-h-0 flex-col gap-0 overflow-hidden"
          : "space-y-5 pb-[max(1rem,env(safe-area-inset-bottom,0px))]"
      }
      style={
        canUse && round
          ? { height: chatShellMinHeight }
          : undefined
      }
    >
      {loadError ? (
        <>
          <p className="parfade-card text-sm text-red-600">{loadError}</p>
        </>
      ) : !round ? (
        <>
          <ParfadeLoadingBlock className="py-12" message="Loading…" size="md" />
        </>
      ) : canUse ? (
        <>
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
