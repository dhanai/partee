"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ConfirmedSpotsRowWeb } from "@/components/confirmed-spots-row-web";
import { PlanningWindowIcon } from "@/components/planning-window-icon";
import { planningWindowTheme } from "@/lib/planning-window-theme";

export type RoundListCardWebPlayer = {
  id: string;
  name: string;
  avatar: string | null;
};

export type RoundListCardWebProps = {
  href: string;
  roundId: string;
  mode: "scheduled" | "planning";
  courseName: string | null;
  /** Used only when mode === "scheduled". */
  imageUrl: string;
  joinPolicy: "instant" | "approval";
  totalSpots: number;
  confirmedPlayers: RoundListCardWebPlayer[];
  /** Scheduled: date + time from `formatScheduledCardMeta`. Planning: window word from `formatPlanningWindow`. */
  primaryMeta: string;
  planningLocation?: string | null;
  planningHeaderDate?: string;
  preferredTimeWindow?: "morning" | "afternoon" | "twilight" | null;
  trailingAfterSpots?: ReactNode;
};

export function RoundListCardWeb({
  href,
  roundId,
  mode,
  courseName,
  imageUrl,
  joinPolicy,
  totalSpots,
  confirmedPlayers,
  primaryMeta,
  planningLocation,
  planningHeaderDate,
  preferredTimeWindow,
  trailingAfterSpots,
}: RoundListCardWebProps) {
  const planningMetaLine =
    mode === "planning"
      ? planningLocation?.trim()
        ? `${primaryMeta} · ${planningLocation.trim()}`
        : primaryMeta
      : null;

  const theme =
    mode === "planning" ? planningWindowTheme(preferredTimeWindow) : null;

  const cardStyle =
    mode === "planning" && theme
      ? {
          backgroundColor: theme.card.backgroundColor,
          borderColor: theme.card.borderColor,
        }
      : undefined;

  const joinLabel = joinPolicy === "instant" ? "Instant" : "Approval";

  return (
    <Link
      href={href as never}
      className={`block rounded-2xl border border-[#ece8e1] bg-white p-[11px] shadow-sm transition hover:shadow-md active:opacity-[0.97] ${
        mode === "planning" ? "border-dashed" : ""
      }`}
      style={cardStyle}
    >
      <div className="flex flex-col gap-2">
        {mode === "scheduled" ? (
          <div className="relative h-[132px] w-full overflow-hidden rounded-xl bg-[#e9e5de]">
            <Image
              src={imageUrl}
              alt={courseName ? `${courseName} cover` : "Round cover"}
              fill
              sizes="(max-width: 640px) 100vw, 480px"
              className="object-cover"
            />
          </div>
        ) : null}

        {mode === "scheduled" ? (
          <>
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 flex-1 text-[20px] font-bold leading-tight tracking-tight text-[#1c1c1e]">
                {courseName ?? "Course TBD"}
              </p>
              <span className="shrink-0 rounded-full bg-[#f1efea] px-2.5 py-1.5 text-[13px] font-semibold text-[#6e6e6e]">
                {joinLabel}
              </span>
            </div>
            <p className="text-[15px] leading-snug text-[#6e6e6e]">{primaryMeta}</p>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 flex-1 text-[20px] font-bold leading-tight tracking-tight text-[#1c1c1e]">
                {planningHeaderDate ??
                  new Date().toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
              </p>
              {theme ? (
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-[13px] font-semibold"
                  style={{ backgroundColor: theme.pillBg, color: theme.pillText }}
                >
                  <PlanningWindowIcon name={theme.icon} color={theme.pillText} size={15} />
                  Planning
                </span>
              ) : null}
            </div>
            <p className="text-[15px] leading-snug text-[#6e6e6e]">{planningMetaLine}</p>
          </>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <ConfirmedSpotsRowWeb
              roundId={roundId}
              totalSpots={totalSpots}
              players={confirmedPlayers}
              size="sm"
              initialTone="fairway"
            />
          </div>
          {trailingAfterSpots ? (
            <div className="shrink-0">{trailingAfterSpots}</div>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
