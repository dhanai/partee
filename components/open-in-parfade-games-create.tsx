"use client";

import type { ReactNode } from "react";

function buildQuery(gameType: string, roundInviteToken?: string) {
  const q = new URLSearchParams({ gameType });
  if (roundInviteToken) q.set("roundInviteToken", roundInviteToken);
  return q.toString();
}

/** Deep link into Expo `app/games/create.tsx` (query params match mobile). */
export function OpenInParfadeGamesCreateLink({
  gameType,
  roundInviteToken,
  className,
  children,
}: {
  gameType: string;
  roundInviteToken?: string;
  className?: string;
  children: ReactNode;
}) {
  const href = `parfade://games/create?${buildQuery(gameType, roundInviteToken)}`;
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}
