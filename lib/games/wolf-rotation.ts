/**
 * Wolf tee rotation: `letterOrderUserIds` is a one-time random permutation (A=index 0, B=index 1, …).
 * Each hole the tee order rotates; wolf is first or last in that order depending on `wolfTeeOff`.
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

/** Random tee-letter assignment (A, B, …) at game start. */
export function shuffleUserIds(ids: string[]): string[] {
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a;
}
