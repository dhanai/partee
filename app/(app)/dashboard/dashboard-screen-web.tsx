"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ParfadeLoadingBlock } from "@/components/parfade-spinner";
import { RoundListCardWeb } from "@/components/round-list-card-web";
import { RoundsHeaderBell } from "@/components/rounds-header-bell";
import {
  formatPlanningHeaderDate,
  formatPlanningWindow,
  formatScheduledCardMeta,
} from "@/lib/round-card-meta";
import { cn } from "@/lib/utils";

type MineTab = "hosting" | "joined" | "invited";

type MineRoundApi = {
  id: string;
  inviteToken: string;
  courseName: string | null;
  teeTime: string | null;
  targetDate: string;
  mode: "scheduled" | "planning";
  preferredTimeWindow: "morning" | "afternoon" | "twilight" | null;
  planningLocation: string | null;
  joinPolicy: "instant" | "approval";
  imageUrl: string;
  totalSpots: number;
  confirmedPlayers?: Array<{ id: string; name: string; avatar: string | null }>;
  spotStatus?: string;
};

const TAB_LIMIT = 100;

const emptyCopy: Record<
  MineTab,
  { title: string; message: string; cta: string; href: Route }
> = {
  hosting: {
    title: "No hosted rounds yet",
    message: "Create your first round and invite friends to get a game going.",
    cta: "Create a round",
    href: "/create",
  },
  joined: {
    title: "No joined rounds yet",
    message: "Claim a spot from Discover and your joined rounds will show up here.",
    cta: "Browse Discover",
    href: "/discover",
  },
  invited: {
    title: "No invites right now",
    message:
      "When someone invites you to a round, it will appear here until you accept or decline.",
    cta: "Browse Discover",
    href: "/discover",
  },
};

export function DashboardScreenWeb() {
  const [tab, setTab] = useState<MineTab>("hosting");
  const [byTab, setByTab] = useState<Record<MineTab, MineRoundApi[]>>({
    hosting: [],
    joined: [],
    invited: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tabs: MineTab[] = ["hosting", "joined", "invited"];
      const responses = await Promise.all(
        tabs.map((t) => fetch(`/api/rounds/mine?tab=${t}&limit=${TAB_LIMIT}`)),
      );
      for (const res of responses) {
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(json.error ?? "Unable to load rounds.");
        }
      }
      const payloads = await Promise.all(
        responses.map((r) => r.json() as Promise<{ rounds: MineRoundApi[] }>),
      );
      setByTab({
        hosting: payloads[0].rounds ?? [],
        joined: payloads[1].rounds ?? [],
        invited: payloads[2].rounds ?? [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load rounds.");
      setByTab({ hosting: [], joined: [], invited: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const activeRounds = byTab[tab];

  return (
    <section className="space-y-6">
      <RoundsHeaderBell />
      <div>
        <h1 className="parfade-page-title">My rounds</h1>
        <p className="parfade-page-sub">
          Hosting, invites, and rounds you&apos;ve joined.
        </p>
      </div>

      <div className="relative flex border-b border-[#ece8e1]">
        {(
          [
            ["hosting", "Hosting"],
            ["joined", "Joined"],
            ["invited", "Invited"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "relative flex-1 pb-2.5 text-center text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#1a3c2a]/25 rounded-t-md",
              tab === id ? "text-[#1a3c2a]" : "text-[#6e6e6e] hover:text-[#1c1c1e]",
            )}
          >
            {label}
            <span
              className={cn(
                "absolute bottom-0 left-2 right-2 h-0.5 rounded-full transition-colors",
                tab === id ? "bg-[#1a3c2a]" : "bg-transparent",
              )}
              aria-hidden
            />
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {loading ? <ParfadeLoadingBlock className="py-10" size="md" /> : null}

      {!loading && !error && activeRounds.length === 0 ? (
        <div className="parfade-card space-y-3 text-left">
          <p className="text-base font-bold text-[#1c1c1e]">{emptyCopy[tab].title}</p>
          <p className="text-sm text-[#6e6e6e]">{emptyCopy[tab].message}</p>
          <Link
            href={emptyCopy[tab].href}
            className="inline-flex rounded-full bg-[#1a3c2a] px-4 py-2.5 text-xs font-bold text-white"
          >
            {emptyCopy[tab].cta}
          </Link>
        </div>
      ) : null}

      {!loading && !error && activeRounds.length > 0 ? (
        <ul className="space-y-3">
          {activeRounds.map((round) => {
            const effectiveDate = round.teeTime ?? round.targetDate;
            return (
              <li key={round.id}>
                <RoundListCardWeb
                  href={`/round/${round.inviteToken}`}
                  roundId={round.id}
                  mode={round.mode}
                  courseName={round.courseName}
                  imageUrl={round.imageUrl}
                  joinPolicy={round.joinPolicy}
                  totalSpots={round.totalSpots}
                  confirmedPlayers={round.confirmedPlayers ?? []}
                  primaryMeta={
                    round.mode === "scheduled"
                      ? formatScheduledCardMeta(effectiveDate, round.teeTime)
                      : formatPlanningWindow(round.preferredTimeWindow)
                  }
                  planningLocation={round.planningLocation}
                  planningHeaderDate={formatPlanningHeaderDate(effectiveDate)}
                  preferredTimeWindow={round.preferredTimeWindow}
                />
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
