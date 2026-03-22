import { timestampMs } from "@/lib/utils";

export type ConfirmedPlayerPublic = {
  id: string;
  name: string;
  avatar: string | null;
};

/** Neon / Drizzle may return `spots.createdAt` as a string. */
type WithClaimTime = ConfirmedPlayerPublic & { claimedAt: Date | string };

function toPublicPlayer(row: WithClaimTime): ConfirmedPlayerPublic {
  return { id: row.id, name: row.name, avatar: row.avatar };
}

/**
 * Left-to-right = claim order (`spots.createdAt` ascending). Host is always first
 * when they have a confirmed spot; everyone else stays in claim order after them.
 */
export function orderConfirmedPlayersHostFirstByClaimOrder(
  rows: WithClaimTime[],
  hostId: string,
): ConfirmedPlayerPublic[] {
  if (rows.length === 0) return [];
  const sorted = [...rows].sort((a, b) => {
    const ma = timestampMs(a.claimedAt) ?? 0;
    const mb = timestampMs(b.claimedAt) ?? 0;
    return ma - mb;
  });
  const hostIdx = sorted.findIndex((r) => r.id === hostId);
  if (hostIdx <= 0) {
    return sorted.map(toPublicPlayer);
  }
  const [host] = sorted.splice(hostIdx, 1);
  return [toPublicPlayer(host), ...sorted.map(toPublicPlayer)];
}
