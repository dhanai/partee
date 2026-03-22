export type WolfHoleOutcome = "wolf_won" | "pack_won" | "tie";

/**
 * Derive wolf hole outcome from who had the best (lowest) score(s) on the hole.
 * Callers should pass at least one id (stroke play always has a best score among the group).
 * - Winners all on Team Wolf → wolf_won
 * - Winners all on Team Pack → pack_won (everyone not on wolf’s side: 3 if lone wolf, else 2 unpicked)
 * - Winners span both teams → `tie` (no wolf points that hole; carry/wash still affects next hole’s stake).
 * Empty array returns tie (defensive only; API rejects empty winnerUserIds).
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
