export type ConfirmedPlayerPublic = {
  id: string;
  name: string;
  avatar: string | null;
};

type WithClaimTime = ConfirmedPlayerPublic & { claimedAt: Date };

/**
 * Left-to-right = claim order (`spots.createdAt` ascending). Host is always first
 * when they have a confirmed spot; everyone else stays in claim order after them.
 */
export function orderConfirmedPlayersHostFirstByClaimOrder(
  rows: WithClaimTime[],
  hostId: string,
): ConfirmedPlayerPublic[] {
  if (rows.length === 0) return [];
  const sorted = [...rows].sort((a, b) => a.claimedAt.getTime() - b.claimedAt.getTime());
  const hostIdx = sorted.findIndex((r) => r.id === hostId);
  if (hostIdx <= 0) {
    return sorted.map(({ claimedAt: _t, ...p }) => p);
  }
  const [host] = sorted.splice(hostIdx, 1);
  return [
    { id: host.id, name: host.name, avatar: host.avatar },
    ...sorted.map(({ claimedAt: _t, ...p }) => p),
  ];
}
