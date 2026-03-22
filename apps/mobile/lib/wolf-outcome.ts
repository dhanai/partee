/** Keep in sync with `lib/games/wolf-outcome.ts`. */

export type WolfHoleOutcome = "wolf_won" | "pack_won" | "tie";

export function deriveWolfHoleOutcome(
  winnerUserIds: string[],
  wolfUserId: string,
  wentAlone: boolean,
  partnerUserId: string | null | undefined,
): WolfHoleOutcome {
  if (winnerUserIds.length === 0) return "tie";

  const wolfTeam = new Set<string>([wolfUserId]);
  if (!wentAlone && partnerUserId) wolfTeam.add(partnerUserId);

  let onWolf = false;
  let onPack = false;
  for (const id of winnerUserIds) {
    if (wolfTeam.has(id)) onWolf = true;
    else onPack = true;
  }
  if (onWolf && onPack) return "tie";
  if (onWolf) return "wolf_won";
  if (onPack) return "pack_won";
  return "tie";
}
