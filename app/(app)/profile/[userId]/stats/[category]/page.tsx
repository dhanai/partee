"use client";

import Link from "next/link";
import { ParfadeLoadingBlock } from "@/components/parfade-spinner";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ensureSkinsFourthColumn } from "@/lib/ensure-skins-fourth-column";
import type { ProfileStatCategoryId, ProfileStatsGrouped } from "@/lib/user-stats-grouped";
import { PROFILE_STAT_LABELS } from "@/lib/profile-stat-themes-web";

export default function ProfileStatCategoryPage() {
  const params = useParams();
  const userId = params.userId as string;
  const rawCat = params.category as string;
  const category = rawCat as ProfileStatCategoryId;
  const [grouped, setGrouped] = useState<ProfileStatsGrouped | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${userId}/stats`);
      const json = (await res.json()) as {
        grouped?: ProfileStatsGrouped;
        stats?: Record<string, number>;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Unable to load.");
      if (json.grouped && json.stats) {
        setGrouped(ensureSkinsFourthColumn(json.grouped, json.stats));
      } else {
        setGrouped(json.grouped ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const valid =
    category === "wolf" || category === "skins" || category === "social";

  const block = grouped && valid ? grouped[category] : null;
  const title = valid ? PROFILE_STAT_LABELS[category] : "Stats";

  return (
    <section className="space-y-4 pb-8">
      <Link
        href="/profile"
        className="text-sm font-semibold text-[#1a3c2a] underline-offset-2 hover:underline"
      >
        ← Profile
      </Link>
      <h1 className="text-[28px] font-bold text-[#1c1c1e]">{title}</h1>
      {loading ? (
        <ParfadeLoadingBlock className="py-6" size="sm" />
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : !valid || !block ? (
        <p className="text-sm text-[#6e6e6e]">Category not found.</p>
      ) : (
        <div className="parfade-card space-y-0 divide-y divide-[#ece8e1] p-0">
          <div className="p-4">
            <p className="text-3xl font-extrabold tabular-nums text-[#1c1c1e]">
              {block.headline}
            </p>
            <p className="text-sm font-semibold text-[#6e6e6e]">{block.headlineLabel}</p>
            <p className="mt-2 text-sm text-[#6e6e6e]">{block.subtitle}</p>
          </div>
          {block.rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
            >
              <span className="text-[#6e6e6e]">{row.label}</span>
              <span className="font-semibold tabular-nums text-[#1c1c1e]">
                {row.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
