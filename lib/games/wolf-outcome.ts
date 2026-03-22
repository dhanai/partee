export type WolfHoleOutcome = "wolf_won" | "pack_won" | "tie";

/**
 * Derive wolf hole outcome from who had the best score(s).
 * - Empty winners → halved / no decisive winner (hole tie for points).
 * - Winners all on wolf’s team → wolf_won
 * - Winners all on pack → pack_won
 * - Winners span both teams → tie
 */
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
