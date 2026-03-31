"use client";

import type { Route } from "next";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ParfadeSpinner } from "@/components/parfade-spinner";
import {
  fetchGameTypesPublic,
  findGameTypeBySlug,
  type GameTypePublicRow,
} from "@/lib/game-types-web-client";
import { serializeGameSessionForApi } from "@/lib/games/serialize";

function statusLabel(s: string) {
  if (s === "active") return "Active";
  if (s === "completed") return "Done";
  return "Abandoned";
}

function formatSessionListDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === now.getFullYear()
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" };
  return d.toLocaleDateString("en-US", opts);
}

function GameStartCard({
  g,
  roundInviteToken,
}: {
  g: GameTypePublicRow;
  roundInviteToken: string;
}) {
  const implemented = g.enabled;
  const createHref =
    `/games/create?gameType=${encodeURIComponent(g.slug)}` +
    (roundInviteToken
      ? `&roundInviteToken=${encodeURIComponent(roundInviteToken)}`
      : "");

  const body = (
    <>
      <span
        className="flex h-[22px] w-[22px] items-center justify-center text-[#1a3c2a]"
        aria-hidden
      >
        {implemented ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.75" />
            <path
              d="M4 20v-2a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v2M15 11h5M17.5 8.5v5"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#6e6e6e]">
            <path
              d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-9Z"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <span className="text-[17px] font-bold text-[#1c1c1e]">{g.title}</span>
      <span className="text-xs leading-4 text-[#6e6e6e]">{g.subtitle}</span>
      {!implemented ? (
        <span className="mt-1 text-[11px] font-semibold text-[#6e6e6e]">Coming soon</span>
      ) : null}
    </>
  );

  const cardClass =
    "flex min-w-[150px] flex-1 basis-[calc(50%-5px)] flex-col gap-1.5 rounded-[14px] border border-[#ece8e1] bg-white p-3 text-left transition hover:opacity-95 active:scale-[0.99]";

  if (!implemented) {
    return <div className={`${cardClass} opacity-80`}>{body}</div>;
  }

  return (
    <Link href={createHref as Route} className={cardClass}>
      {body}
    </Link>
  );
}

type SessionRow = ReturnType<typeof serializeGameSessionForApi>;

export function GamesScreenWeb() {
  const searchParams = useSearchParams();
  const roundInviteToken = searchParams.get("roundInviteToken")?.trim() ?? "";

  const [gameTypes, setGameTypes] = useState<GameTypePublicRow[] | null>(null);
  const [gameTypesError, setGameTypesError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/games/mine");
      const json = (await res.json()) as {
        sessions?: SessionRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Could not load games.");
      setSessions(json.sessions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load games.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchGameTypesPublic();
        if (!cancelled) setGameTypes(rows);
      } catch (e) {
        if (!cancelled) {
          setGameTypesError(e instanceof Error ? e.message : "Could not load game types.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="space-y-6 pb-2">
      <div>
        <h1 className="parfade-page-title">Games</h1>
        <p className="parfade-page-sub">
          Side games with your group — start Skins, Wolf, or pick up where you left off.
        </p>
      </div>

      {roundInviteToken ? (
        <div className="rounded-xl border border-[#ece8e1] bg-[#edf4ef] p-3 text-sm leading-snug text-[#1c1c1e]">
          Pick a game for this round — confirmed players are added automatically.
        </div>
      ) : null}

      <div>
        <p className="parfade-label">Start a game</p>
        <div className="flex flex-wrap gap-2.5">
          {gameTypesError ? (
            <p className="text-sm text-amber-900">{gameTypesError}</p>
          ) : gameTypes == null ? (
            <div className="flex justify-center py-4">
              <ParfadeSpinner size="sm" />
            </div>
          ) : (
            [...gameTypes]
              .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
              .map((g) => (
                <GameStartCard key={g.slug} g={g} roundInviteToken={roundInviteToken} />
              ))
          )}
        </div>
        <p className="mt-3 text-xs leading-snug text-[#6e6e6e]">
          {roundInviteToken
            ? "Start here on the web, or use the Parfade app for full setup (guests, 9 holes, tie options)."
            : "Pick a game to start on the web (you’ll need a round link), or use the app to choose players from your network."}
        </p>
      </div>

      {error ? (
        <p className="rounded-2xl border border-[#ece8e1] bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {error}
        </p>
      ) : null}

      <div>
        <p className="parfade-label">Your sessions</p>
        {loading ? (
          <div className="flex justify-center py-6">
            <ParfadeSpinner size="sm" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-[#6e6e6e]">No games yet — pick a format above.</p>
        ) : (
          <ul className="space-y-2">
            {sessions.map((s) => {
              const def = gameTypes ? findGameTypeBySlug(gameTypes, s.gameType) : undefined;
              const meta = `${formatSessionListDate(s.startedAt || s.createdAt)} · ${s.holesCount} holes · ${statusLabel(s.status)}`;
              return (
                <li key={s.id}>
                  <Link
                    href={`/games/session/${s.id}` as Route}
                    className="flex w-full items-center gap-3 rounded-xl border border-[#ece8e1] bg-white px-3.5 py-3 text-left shadow-sm transition hover:bg-[#faf8f5] active:opacity-90"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-bold text-[#1c1c1e]">
                        {def?.title ?? s.gameType}
                      </p>
                      <p className="text-[13px] text-[#6e6e6e]">{meta}</p>
                    </div>
                    <span className="shrink-0 text-[#6e6e6e]" aria-hidden>
                      &rsaquo;
                    </span>
                  </Link>
                  {s.roundInviteToken ? (
                    <p className="mt-1 pl-1 text-xs text-[#6e6e6e]">
                      Round:{" "}
                      <Link
                        href={`/round/${s.roundInviteToken}`}
                        className="font-semibold text-[#1a3c2a] underline-offset-2 hover:underline"
                      >
                        open invite
                      </Link>
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
