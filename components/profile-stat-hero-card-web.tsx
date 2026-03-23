"use client";

import Link from "next/link";
import type {
  ProfileCategoryStatsBlock,
  ProfileStatCategoryId,
} from "@/lib/user-stats-grouped";
import {
  PROFILE_STAT_LABELS,
  PROFILE_STAT_THEMES,
} from "@/lib/profile-stat-themes-web";

function CategoryIcon({ kind, color }: { kind: "paw" | "flag" | "people"; color: string }) {
  const stroke = color;
  if (kind === "paw") {
    return (
      <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 10c-2-3-6-2-6 2s2.5 4 6 4 6-2 6-4-4-5-6-2Z"
          stroke={stroke}
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <circle cx="7.5" cy="7" r="1.25" fill={stroke} />
        <circle cx="12" cy="5" r="1.25" fill={stroke} />
        <circle cx="16.5" cy="7" r="1.25" fill={stroke} />
      </svg>
    );
  }
  if (kind === "flag") {
    return (
      <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M5 3v18M5 4h12l-2 4 2 4H5"
          stroke={stroke}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="7" r="3" stroke={stroke} strokeWidth="1.75" />
      <path
        d="M3 21c0-3.5 3-6 6-6s6 2.5 6 6"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M16 11h5M18.5 8.5v5"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

type StackPos = "first" | "middle" | "last";

export function ProfileStatHeroCardWeb({
  category,
  block,
  userId,
  stackPosition,
}: {
  category: ProfileStatCategoryId;
  block: ProfileCategoryStatsBlock;
  userId: string;
  stackPosition: StackPos;
}) {
  const t = PROFILE_STAT_THEMES[category];
  const title = PROFILE_STAT_LABELS[category];
  const highlights = block.highlights ?? [];

  const radius =
    stackPosition === "first"
      ? "rounded-t-[22px]"
      : stackPosition === "last"
        ? "rounded-b-[22px]"
        : "";
  const borderT = stackPosition === "first" ? "border-t" : "";
  const marginT = stackPosition !== "first" ? "-mt-px" : "";

  return (
    <Link
      href={`/profile/${userId}/stats/${category}` as never}
      className={`block border-x border-b border-black/[0.08] px-4 pb-4 pt-3.5 transition hover:opacity-95 active:opacity-90 ${radius} ${borderT} ${marginT}`}
      style={{
        backgroundColor: t.bg,
        borderColor: t.border,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[22px] font-extrabold tracking-tight" style={{ color: t.accent }}>
          {title}
        </span>
        <span
          className="flex h-10 w-10 items-center justify-center rounded-full"
          style={{ backgroundColor: "rgba(255,255,255,0.65)" }}
        >
          <CategoryIcon kind={t.icon} color={t.accent} />
        </span>
      </div>
      <div className="my-3 h-px bg-black/[0.08]" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {highlights.map((h) => (
          <div key={h.label} className="min-w-0 text-center">
            <p className="truncate text-lg font-bold tabular-nums text-[#1c1c1e]">{h.value}</p>
            <p className="mt-1 line-clamp-2 text-[10px] font-bold uppercase leading-tight tracking-wide text-[#6e6e6e]">
              {h.label}
            </p>
          </div>
        ))}
      </div>
    </Link>
  );
}
