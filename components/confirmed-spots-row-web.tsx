"use client";

import Image from "next/image";

export type ConfirmedSpotPlayerWeb = {
  id: string;
  name: string;
  avatar: string | null;
};

const SIZES = {
  sm: { dim: 24, gap: 6, font: 11 },
  md: { dim: 32, gap: 8, font: 12 },
} as const;

type Props = {
  roundId: string;
  totalSpots: number;
  players: ConfirmedSpotPlayerWeb[];
  size?: keyof typeof SIZES;
  /** sm: fairway initials; md: muted initials (round detail) */
  initialTone?: "fairway" | "muted";
};

export function ConfirmedSpotsRowWeb({
  roundId,
  totalSpots,
  players,
  size = "sm",
  initialTone = "fairway",
}: Props) {
  const s = SIZES[size];
  const n = Math.max(0, totalSpots);
  const dimPx = s.dim;
  const dimClass = `shrink-0 rounded-full object-cover`;
  const gapClass = size === "md" ? "gap-2" : "gap-1.5";

  return (
    <div className={`flex flex-wrap items-center ${gapClass}`}>
      {Array.from({ length: n }).map((_, idx) => {
        const player = players[idx] ?? null;
        const key = `${roundId}-spot-${idx}`;

        if (!player) {
          return (
            <div
              key={key}
              style={{ width: dimPx, height: dimPx }}
              className={`${dimClass} border border-[#ddd6cc] bg-[#e9e5de]`}
              aria-hidden
            />
          );
        }

        const initial = player.name.trim().charAt(0).toUpperCase() || "?";

        if (player.avatar) {
          return (
            <Image
              key={key}
              src={player.avatar}
              alt=""
              width={dimPx}
              height={dimPx}
              className={`${dimClass} border border-[#ddd6cc]`}
              style={{ width: dimPx, height: dimPx }}
            />
          );
        }

        const mutedCls =
          initialTone === "muted"
            ? "border border-[#ece8e1] bg-[#f1efea] text-[#6e6e6e]"
            : "border border-[#cfe4d4] bg-[#edf4ef] text-[#1a3c2a]";

        return (
          <div
            key={key}
            style={{ width: dimPx, height: dimPx, fontSize: s.font }}
            className={`${dimClass} flex items-center justify-center font-bold ${mutedCls}`}
            aria-hidden
          >
            {initial}
          </div>
        );
      })}
    </div>
  );
}

type InvitedScrollWebProps = {
  roundId: string;
  players: ConfirmedSpotPlayerWeb[];
  size?: keyof typeof SIZES;
  initialTone?: "fairway" | "muted";
};

/** Same visuals as {@link ConfirmedSpotsRowWeb} avatars; scrolls horizontally when needed. */
export function HostInvitedSpotsScrollRowWeb({
  roundId,
  players,
  size = "md",
  initialTone = "muted",
}: InvitedScrollWebProps) {
  const s = SIZES[size];
  const dimPx = s.dim;
  const dimClass = `shrink-0 rounded-full object-cover`;
  const gapClass = size === "md" ? "gap-2" : "gap-1.5";

  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-0.5">
      <div className={`flex w-max min-w-0 flex-nowrap items-center ${gapClass}`}>
        {players.map((player) => {
          const key = `${roundId}-${player.id}`;
          const initial = player.name.trim().charAt(0).toUpperCase() || "?";

          if (player.avatar) {
            return (
              <Image
                key={key}
                src={player.avatar}
                alt=""
                width={dimPx}
                height={dimPx}
                className={`${dimClass} border border-[#ddd6cc]`}
                style={{ width: dimPx, height: dimPx }}
              />
            );
          }

          const mutedCls =
            initialTone === "muted"
              ? "border border-[#ece8e1] bg-[#f1efea] text-[#6e6e6e]"
              : "border border-[#cfe4d4] bg-[#edf4ef] text-[#1a3c2a]";

          return (
            <div
              key={key}
              style={{ width: dimPx, height: dimPx, fontSize: s.font }}
              className={`${dimClass} flex shrink-0 items-center justify-center font-bold ${mutedCls}`}
              aria-hidden
            >
              {initial}
            </div>
          );
        })}
      </div>
    </div>
  );
}
