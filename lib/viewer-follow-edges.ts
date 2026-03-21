import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { userFollows } from "@/db/schema";

export type FollowEdgePair = {
  outgoing: "requested" | "accepted" | null;
  incoming: "requested" | "accepted" | null;
};

/** For each `otherUserId`, viewer→other outgoing and other→viewer incoming follow row statuses. */
export async function edgesViewerToUserIds(
  viewerId: string,
  otherUserIds: string[],
): Promise<Map<string, FollowEdgePair>> {
  const result = new Map<string, FollowEdgePair>();
  const ids = [...new Set(otherUserIds)];
  for (const id of ids) {
    result.set(id, { outgoing: null, incoming: null });
  }

  const filtered = ids.filter((id) => id !== viewerId);
  if (filtered.length === 0) return result;

  const outRows = await db
    .select({
      followedId: userFollows.followedId,
      status: userFollows.status,
    })
    .from(userFollows)
    .where(and(eq(userFollows.followerId, viewerId), inArray(userFollows.followedId, filtered)));

  const inRows = await db
    .select({
      followerId: userFollows.followerId,
      status: userFollows.status,
    })
    .from(userFollows)
    .where(and(eq(userFollows.followedId, viewerId), inArray(userFollows.followerId, filtered)));

  for (const r of outRows) {
    const p = result.get(r.followedId);
    if (p) p.outgoing = r.status;
  }
  for (const r of inRows) {
    const p = result.get(r.followerId);
    if (p) p.incoming = r.status;
  }

  return result;
}
