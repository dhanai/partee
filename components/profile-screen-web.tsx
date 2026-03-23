"use client";

import Image from "next/image";
import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppHeaderActions } from "@/components/app-header-actions-context";
import { ParfadeLoadingBlock } from "@/components/parfade-spinner";
import { ProfileStatHeroCardWeb } from "@/components/profile-stat-hero-card-web";
import { ensureSkinsFourthColumn } from "@/lib/ensure-skins-fourth-column";
import type { ProfileStatsGrouped } from "@/lib/user-stats-grouped";

type MeUser = {
  id: string;
  name: string;
  email: string | null;
  avatar: string | null;
  handicap: string | null;
  location: string | null;
  homeCourse: string | null;
  followersCount?: number;
  followingCount?: number;
};

export function ProfileScreenWeb() {
  const { setHeaderActions } = useAppHeaderActions();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<MeUser | null>(null);
  const [groupedStats, setGroupedStats] = useState<ProfileStatsGrouped | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const meRes = await fetch("/api/users/me");
      const meJson = (await meRes.json()) as { user?: MeUser; error?: string };
      if (!meRes.ok) throw new Error(meJson.error ?? "Unable to load profile.");
      setUser(meJson.user ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch("/api/users/me/stats");
      const json = (await res.json()) as {
        grouped?: ProfileStatsGrouped;
        stats?: Record<string, number>;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Stats unavailable.");
      if (json.grouped && json.stats) {
        setGroupedStats(ensureSkinsFourthColumn(json.grouped, json.stats));
      } else {
        setGroupedStats(json.grouped ?? null);
      }
    } catch {
      setGroupedStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadStats();
  }, [load, loadStats]);

  useEffect(() => {
    setHeaderActions(
      <Link
        href="/settings"
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border border-[#ece8e1] bg-white text-[#1a3c2a] shadow-sm transition hover:bg-[#faf8f5] active:opacity-90"
        aria-label="Settings"
      >
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden>
          {/* Horizontal sliders — matches Ionicons `options-outline` on mobile */}
          <path
            d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 4v4M12 12v4M16 20v-4"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>,
    );
    return () => setHeaderActions(null);
  }, [setHeaderActions]);

  const initials = useMemo(() => {
    const n = user?.name?.trim() ?? "";
    if (!n) return "P";
    return n
      .split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }, [user?.name]);

  const locationDisplay =
    user?.location?.trim() || user?.homeCourse?.trim() || "";

  async function shareProfile() {
    const label = user?.name?.trim() || "Parfade golfer";
    const text = `Check out ${label}'s profile on Parfade.`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text });
      } catch {
        /* dismissed */
      }
    } else {
      void navigator.clipboard.writeText(text);
    }
  }

  const avatarSizeClass = "mx-auto aspect-square w-[min(75vw,280px)] max-w-[280px]";

  return (
    <div className="relative pb-10">
      {loading ? (
        <ParfadeLoadingBlock className="py-12" message="Loading profile…" size="md" />
      ) : (
        <div className="flex flex-col items-center pt-1">
          <div
            className={`${avatarSizeClass} overflow-hidden rounded-[28px] bg-white shadow-[0_10px_22px_rgba(0,0,0,0.14)]`}
          >
            {user?.avatar ? (
              <Image
                src={user.avatar}
                alt=""
                width={400}
                height={400}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[#edf4ef] text-[clamp(2rem,12vw,3.5rem)] font-extrabold text-[#1a3c2a]">
                {initials}
              </div>
            )}
          </div>

          <div className="mt-5 w-full max-w-md px-2 text-center">
            <h1 className="text-[26px] font-extrabold tracking-tight text-[#1c1c1e]">
              {user?.name?.trim() || "Your profile"}
            </h1>
            {locationDisplay ? (
              <p className="mt-1.5 text-base font-semibold text-[#6e6e6e]">{locationDisplay}</p>
            ) : null}
          </div>

          {user?.id ? (
            <div className="mt-6 flex w-full max-w-lg border-y border-[#ece8e1] py-5">
              <div className="flex flex-1 flex-col items-center gap-1 py-1">
                <span className="text-xl font-extrabold text-[#1c1c1e]">
                  {user.handicap?.trim() || "—"}
                </span>
                <span className="text-xs font-semibold uppercase tracking-[0.04em] text-[#6e6e6e]">
                  Handicap
                </span>
              </div>
              <div className="flex flex-1 flex-col items-center gap-1 py-1">
                <span className="text-xl font-extrabold text-[#1c1c1e]">
                  {user.followersCount ?? 0}
                </span>
                <span className="text-xs font-semibold uppercase tracking-[0.04em] text-[#6e6e6e]">
                  Followers
                </span>
              </div>
              <div className="flex flex-1 flex-col items-center gap-1 py-1">
                <span className="text-xl font-extrabold text-[#1c1c1e]">
                  {user.followingCount ?? 0}
                </span>
                <span className="text-xs font-semibold uppercase tracking-[0.04em] text-[#6e6e6e]">
                  Following
                </span>
              </div>
            </div>
          ) : null}

          <div className="mt-5 flex w-full max-w-md flex-row gap-2.5 px-1">
            <Link
              href={"/profile/edit" as Route}
              className="parfade-btn-primary flex-1 rounded-2xl py-3.5 text-center text-[17px] font-bold"
            >
              Edit profile
            </Link>
            <button
              type="button"
              onClick={() => void shareProfile()}
              className="parfade-btn-secondary flex-1 rounded-2xl border border-[#ece8e1] bg-white py-3.5 text-center text-[17px] font-semibold text-[#1a3c2a] shadow-sm"
            >
              Share profile
            </button>
          </div>

          <div className="mt-6 w-full border-t border-[#ece8e1] pt-5">
            <h2 className="mb-3.5 text-center text-lg font-extrabold tracking-tight text-[#1c1c1e]">
              Stats and achievements
            </h2>
            {statsLoading || !groupedStats ? (
              <ParfadeLoadingBlock className="py-8" message="Loading stats…" size="sm" />
            ) : (
              <div className="w-full">
                {(["wolf", "skins", "social"] as const).map((id, index) => (
                  <ProfileStatHeroCardWeb
                    key={id}
                    category={id}
                    block={groupedStats[id]}
                    userId={user?.id ?? ""}
                    stackPosition={
                      index === 0 ? "first" : index === 2 ? "last" : "middle"
                    }
                  />
                ))}
              </div>
            )}
          </div>

          {error ? (
            <p className="mt-4 text-center text-sm text-[#b42318]">{error}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
