/**
 * Keep in sync with `lib/games/wolf-rotation.ts` (server).
 */

export type WolfTeeOff = "first" | "last";

export function teeOrderForHole(letterOrderUserIds: string[], holeNumber: number): string[] {
  const n = letterOrderUserIds.length;
  if (n === 0) return [];
  const k = (holeNumber - 1) % n;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(letterOrderUserIds[(k + i) % n]!);
  }
  return out;
}

export function wolfUserIdForHole(
  letterOrderUserIds: string[],
  holeNumber: number,
  wolfTeeOff: WolfTeeOff,
): string {
  const order = teeOrderForHole(letterOrderUserIds, holeNumber);
  const n = order.length;
  if (n === 0) return "";
  return wolfTeeOff === "first" ? order[0]! : order[n - 1]!;
}

export const WOLF_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

export function letterLabelForUser(
  letterOrderUserIds: string[],
  userId: string,
): string {
  const idx = letterOrderUserIds.indexOf(userId);
  if (idx < 0) return "?";
  return WOLF_LETTERS[idx] ?? String(idx + 1);
}
