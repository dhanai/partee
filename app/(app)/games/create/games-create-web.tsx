"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { OpenInParfadeGamesCreateLink } from "@/components/open-in-parfade-games-create";
import { ParfadeLoadingBlock, ParfadeSpinner } from "@/components/parfade-spinner";
import { getGameDefinition, type GameTypeId } from "@/lib/games-registry";

type RoundForGame = {
  hostId: string;
  courseName: string;
  confirmedPlayers: Array<{ id: string; name: string }>;
};

export function GamesCreateWeb() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const gameTypeRaw = searchParams.get("gameType")?.trim() ?? "";
  const roundInviteToken = searchParams.get("roundInviteToken")?.trim() ?? "";

  const { getToken, isLoaded } = useAuth();

  const def = gameTypeRaw ? getGameDefinition(gameTypeRaw) : undefined;
  const [round, setRound] = useState<RoundForGame | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingRound, setLoadingRound] = useState(Boolean(roundInviteToken));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadRound = useCallback(async () => {
    if (!roundInviteToken) {
      setLoadingRound(false);
      return;
    }
    setLoadingRound(true);
    setLoadError(null);
    try {
      const token = await getToken();
      if (!token) {
        setLoadError("Sign in to start a game for this round.");
        return;
      }
      const res = await fetch(`/api/rounds/${encodeURIComponent(roundInviteToken)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as { round?: RoundForGame; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load round.");
      setRound(json.round ?? null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load round.");
    } finally {
      setLoadingRound(false);
    }
  }, [roundInviteToken, getToken]);

  useEffect(() => {
    if (!isLoaded || !roundInviteToken) return;
    void loadRound();
  }, [isLoaded, roundInviteToken, loadRound]);

  async function startGame() {
    if (!def?.implemented || !gameTypeRaw) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const token = await getToken();
      if (!token) {
        setSubmitError("Sign in to start a game.");
        return;
      }

      const playerUserIds: string[] = [];
      if (round) {
        const ids = new Set<string>();
        ids.add(round.hostId);
        for (const p of round.confirmedPlayers) ids.add(p.id);
        playerUserIds.push(...ids);
      }

      const body: Record<string, unknown> = {
        gameType: gameTypeRaw as GameTypeId,
        playerUserIds,
        holesCount: 18,
      };

      if (gameTypeRaw === "wolf") {
        body.settings = { wolfTeeOff: "first", wolfTieHandling: "carry" };
      }
      if (gameTypeRaw === "skins") {
        body.settings = { skinsTieHandling: "carry" };
      }
      if (roundInviteToken) {
        body.roundInviteToken = roundInviteToken;
      }

      const res = await fetch("/api/games", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { session?: { id: string }; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not start game.");
      if (!json.session?.id) throw new Error("Could not start game.");
      router.push(`/games/session/${json.session.id}`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Could not start game.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!gameTypeRaw || !def) {
    return (
      <section className="space-y-4">
        <Link href="/games" className="text-sm font-semibold text-[#1a3c2a]">
          &larr; Games
        </Link>
        <p className="text-sm text-[#6e6e6e]">Pick a game from the Games tab.</p>
      </section>
    );
  }

  if (!def.implemented) {
    return (
      <section className="space-y-4">
        <Link href="/games" className="text-sm font-semibold text-[#1a3c2a]">
          &larr; Games
        </Link>
        <h1 className="parfade-page-title">{def.title}</h1>
        <p className="text-sm text-[#6e6e6e]">This format isn&apos;t available yet.</p>
      </section>
    );
  }

  if (!isLoaded) {
    return <ParfadeLoadingBlock className="py-12" message="Loading…" size="md" />;
  }

  if (roundInviteToken && loadingRound) {
    return <ParfadeLoadingBlock className="py-12" message="Loading round…" size="md" />;
  }

  if (roundInviteToken && loadError) {
    return (
      <section className="space-y-4">
        <Link href="/games" className="text-sm font-semibold text-[#1a3c2a]">
          &larr; Games
        </Link>
        <p className="parfade-card text-sm text-red-600">{loadError}</p>
      </section>
    );
  }

  if (!roundInviteToken) {
    return (
      <section className="space-y-5">
        <Link href="/games" className="text-sm font-semibold text-[#1a3c2a]">
          &larr; Games
        </Link>
        <div>
          <h1 className="parfade-page-title">Start {def.title}</h1>
          <p className="parfade-page-sub">
            On the web, new games need a round so we know who&apos;s playing. Open{" "}
            <strong>Side games</strong> from a round you&apos;re in, or use the app to pick
            friends from your network.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link
            href="/discover"
            className="inline-flex items-center justify-center rounded-2xl bg-[#1a3c2a] px-5 py-3 text-sm font-bold text-[#f4f1ea]"
          >
            Discover rounds
          </Link>
        </div>
        <p className="text-xs text-[#6e6e6e]">
          App deep link (if Parfade is installed):{" "}
          <a
            href={`parfade://games/create?gameType=${encodeURIComponent(gameTypeRaw)}`}
            className="font-semibold text-[#1a3c2a] underline-offset-2 hover:underline"
          >
            parfade://…
          </a>
        </p>
      </section>
    );
  }

  const rosterIds = round
    ? (() => {
        const ids = new Set<string>();
        ids.add(round.hostId);
        for (const p of round.confirmedPlayers) ids.add(p.id);
        return ids.size;
      })()
    : 0;
  const minOk = rosterIds >= def.minPlayers;
  const wolfCapOk = gameTypeRaw !== "wolf" || rosterIds <= (def.maxPlayers ?? 99);

  return (
    <section className="space-y-5 pb-2">
      <Link href={`/games?roundInviteToken=${encodeURIComponent(roundInviteToken)}`} className="text-sm font-semibold text-[#1a3c2a]">
        &larr; Games for this round
      </Link>

      <div>
        <h1 className="parfade-page-title">{def.title}</h1>
        <p className="parfade-page-sub">{def.subtitle}</p>
        {round ? (
          <p className="mt-2 text-sm text-[#6e6e6e]">
            Round: <span className="font-semibold text-[#1c1c1e]">{round.courseName}</span> ·{" "}
            {rosterIds} golfer{rosterIds === 1 ? "" : "s"} (host + confirmed)
          </p>
        ) : null}
      </div>

      {!minOk ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {def.title} needs at least {def.minPlayers} golfers on this round. Invite more players
          or wait for confirmations.
        </p>
      ) : null}

      {gameTypeRaw === "wolf" && !wolfCapOk ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Wolf is for exactly four golfers. This round has more than four confirmed players — start
          Wolf from the app or pick a different format.
        </p>
      ) : null}

      {submitError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {submitError}
        </p>
      ) : null}

      {minOk && wolfCapOk ? (
        <button
          type="button"
          onClick={() => void startGame()}
          disabled={submitting}
          className="parfade-btn-primary inline-flex w-full max-w-sm items-center justify-center gap-2 disabled:opacity-40"
        >
          {submitting ? (
            <>
              <ParfadeSpinner size="sm" variant="onPrimary" aria-label="Starting" />
              Starting…
            </>
          ) : (
            "Start game"
          )}
        </button>
      ) : null}

      <p className="text-xs leading-relaxed text-[#6e6e6e]">
        Advanced options (guests, 9 holes, tie rules) —{" "}
        <OpenInParfadeGamesCreateLink
          gameType={gameTypeRaw}
          roundInviteToken={roundInviteToken}
          className="font-semibold text-[#1a3c2a] underline-offset-2 hover:underline"
        >
          open in the Parfade app
        </OpenInParfadeGamesCreateLink>
        .
      </p>
    </section>
  );
}
