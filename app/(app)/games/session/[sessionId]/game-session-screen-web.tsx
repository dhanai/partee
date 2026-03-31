"use client";

import { useAuth } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAppAlert } from "@/components/app-alert-dialog";
import { OpenInParfadeGameSessionBar } from "@/components/open-in-parfade-game-session";
import { ParfadeLoadingBlock, ParfadeSpinner } from "@/components/parfade-spinner";
import {
  fetchGameTypesPublic,
  findGameTypeBySlug,
  type GameTypePublicRow,
} from "@/lib/game-types-web-client";

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
  const router = useRouter();
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : "";
  const { getToken, isLoaded, userId } = useAuth();
  const { confirm, showAlert } = useAppAlert();
  const [browserUrl, setBrowserUrl] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [session, setSession] = useState<SessionRow | null>(null);
  const [players, setPlayers] = useState<GamePlayerRow[]>([]);
  const [holes, setHoles] = useState<GameHoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gameTypes, setGameTypes] = useState<GameTypePublicRow[] | null>(null);

  useEffect(() => {
    setBrowserUrl(typeof window !== "undefined" ? window.location.href : "");
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchGameTypesPublic();
        if (!cancelled) setGameTypes(rows);
      } catch {
        if (!cancelled) setGameTypes([]);
      }
    })();
    return () => {
      cancelled = true;
    };
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

  const handleDeleteGame = useCallback(async () => {
    if (deleteBusy || !sessionId) return;
    const accepted = await confirm(
      "This removes the game and all recorded holes for everyone in the group.",
      {
        title: "Delete game?",
        variant: "destructive",
        confirmLabel: "Delete",
      },
    );
    if (!accepted) return;
    setDeleteBusy(true);
    try {
      const token = await getToken();
      if (!token) {
        await showAlert("Sign in to delete this game.", { title: "Could not delete" });
        return;
      }
      const res = await fetch(`/api/games/${sessionId}/delete`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        await showAlert(json.error ?? "Could not delete game.", {
          title: "Could not delete",
        });
        return;
      }
      router.push("/games");
      router.refresh();
    } finally {
      setDeleteBusy(false);
    }
  }, [confirm, deleteBusy, getToken, sessionId, router, showAlert]);

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

  const def =
    gameTypes && session ? findGameTypeBySlug(gameTypes, session.gameType) : undefined;
  const title = def?.title ?? session.gameType;
  const holesWithData = holes.length;
  const sortedPlayers = [...players].sort((a, b) => a.sortOrder - b.sortOrder);
  const canDeleteGame =
    Boolean(userId) && sortedPlayers.some((p) => p.userId === userId);

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

      {canDeleteGame ? (
        <div className="border-t border-[#ece8e1] pt-5">
          <button
            type="button"
            disabled={deleteBusy}
            onClick={() => void handleDeleteGame()}
            className="w-full rounded-xl border border-red-200 bg-red-50 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
          >
            {deleteBusy ? (
              <span className="inline-flex items-center justify-center gap-2">
                <ParfadeSpinner size="sm" variant="muted" aria-label="Deleting" />
                Deleting…
              </span>
            ) : (
              "Delete game"
            )}
          </button>
          <p className="mt-2 text-xs text-[#6e6e6e]">
            Removes this session and all hole scores for everyone in the group.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}
