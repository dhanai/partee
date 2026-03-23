import type { DiscoverRound } from "../types/round";
import { DISCOVER_NATIVE_AD_EVERY_N_ROUNDS } from "./parfade-admob";

export type DiscoverFeedRow =
  | { type: "round"; round: DiscoverRound }
  | { type: "ad"; slotId: string };

/** Inserts a native-ad row after every Nth round (scrollable inline feed). */
export function buildDiscoverFeedRows(rounds: DiscoverRound[]): DiscoverFeedRow[] {
  const rows: DiscoverFeedRow[] = [];
  const n = DISCOVER_NATIVE_AD_EVERY_N_ROUNDS;
  rounds.forEach((round, index) => {
    rows.push({ type: "round", round });
    if (n > 0 && (index + 1) % n === 0) {
      rows.push({
        type: "ad",
        slotId: `discover-native-after-${index}-${round.id}`,
      });
    }
  });
  // Fewer than N rounds: still show one ad as the last row (no ad was inserted at N, 2N, …).
  if (n > 0 && rounds.length > 0 && rounds.length < n) {
    const last = rounds[rounds.length - 1];
    const lastIndex = rounds.length - 1;
    rows.push({
      type: "ad",
      slotId: `discover-native-tail-${lastIndex}-${last.id}`,
    });
  }
  return rows;
}
