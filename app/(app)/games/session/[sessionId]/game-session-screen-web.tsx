"use client";

import { useAuth } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { OpenInParfadeGameSessionBar } from "@/components/open-in-parfade-game-session";
import { ParfadeLoadingBlock } from "@/components/parfade-spinner";
import { getGameDefinition } from "@/lib/games-registry";

type SessionRow = {
  id: string;
  gameType: string;
  roundInviteToken: string | null;
  status: string;
  holesCount: number;
};

type GamePlayerRow = {
  userId: string;
  sortOrder: number;
  teamId: string | null;
  name: string;
  avatar: string | null;
  isGuest?: boolean;
};

type GameHoleRow = {
  holeNumber: number;
  version: number;
  recordedBy: string;
  payload: Record<string, unknown>;
  updatedAt: string;
};

function statusLabel(s: string) {
  if (s === "active") return "Active";
  if (s === "completed") return "Done";
  return "Abandoned";
}

export function GameSessionScreenWeb() {
  const params = useParams();
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : "";
  const { getToken, isLoaded } = useAuth();
  const [browserUrl, setBrowserUrl] = useState("");

  const [session, setSession] = useState<SessionRow | null>(null);
  const [players, setPlayers] = useState<GamePlayerRow[]>([]);
  const [holes, setHoles] = useState<GameHoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBrowserUrl(typeof window !== "undefined" ? window.location.href : "");
  }, []);

  const load = useCallback(async () => {
    if (!sessionId || !isUuid(sessionId)) {
      setError("Invalid game link.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setError("Sign in to view this game.");
        setLoading(false);
        return;
      }
      const res = await fetch(`/api/games/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as {
        session?: SessionRow;
        players?: GamePlayerRow[];
        holes?: GameHoleRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Could not load game.");
      setSession(json.session ?? null);
      setPlayers(json.players ?? []);
      setHoles(json.holes ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load game.");
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [sessionId, getToken]);

  useEffect(() => {
    if (!isLoaded) return;
    void load();
  }, [isLoaded, load]);

  if (!sessionId) {
    return <p className="text-sm text-red-600">Missing session.</p>;
  }

  if (loading) {
    return <ParfadeLoadingBlock className="py-12" message="Loading game…" size="md" />;
  }

  if (error || !session) {
    return (
      <section className="space-y-4">
        <Link
          href="/games"
          className="inline-flex items-center gap-1 text-sm font-semibold text-[#1a3c2a]"
        >
          <span aria-hidden>&larr;</span> Games
        </Link>
        <p className="parfade-card text-sm text-red-600">{error ?? "Game not found."}</p>
      </section>
    );
  }

  const def = getGameDefinition(session.gameType);
  const title = def?.title ?? session.gameType;
  const holesWithData = holes.length;
  const sortedPlayers = [...players].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <section className="space-y-5 pb-2">
      <Link
        href="/games"
        className="inline-flex items-center gap-1 text-sm font-semibold text-[#1a3c2a]"
      >
        <span aria-hidden>&larr;</span> Games
      </Link>

      <div>
        <h1 className="parfade-page-title">{title}</h1>
        <p className="parfade-page-sub">
          {statusLabel(session.status)} · {session.holesCount} holes · {holesWithData} with scores
        </p>
      </div>

      {session.roundInviteToken ? (
        <p className="text-sm text-[#6e6e6e]">
          Round:{" "}
          <Link
            href={`/round/${session.roundInviteToken}`}
            className="font-semibold text-[#1a3c2a] underline-offset-2 hover:underline"
          >
            open round
          </Link>
        </p>
      ) : null}

      <OpenInParfadeGameSessionBar sessionId={sessionId} browserUrl={browserUrl} />

      <div>
        <p className="parfade-label">Players</p>
        <ul className="mt-2 space-y-2">
          {sortedPlayers.map((p) => (
            <li
              key={`${p.userId}-${p.sortOrder}`}
              className="flex items-center gap-3 rounded-xl border border-[#ece8e1] bg-white px-3 py-2.5"
            >
              {p.avatar ? (
                <Image
                  src={p.avatar}
                  alt=""
                  width={36}
                  height={36}
                  className="h-9 w-9 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#edf4ef] text-sm font-bold text-[#1a3c2a]">
                  {p.name.trim().charAt(0).toUpperCase() || "?"}
                </div>
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#1c1c1e]">
                {p.name}
                {p.isGuest ? (
                  <span className="ml-1.5 text-xs font-medium text-[#6e6e6e]">Guest</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}
