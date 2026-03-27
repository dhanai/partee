import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { userFollows } from "@/db/schema";

/**
 * Returns the set of user IDs that the viewer has an accepted follow on.
 * Single indexed lookup on user_follows(follower_id).
 */
export async function getViewerFollowedIds(viewerId: string): Promise<Set<string>> {
  const rows = await db
    .select({ followedId: userFollows.followedId })
    .from(userFollows)
    .where(and(eq(userFollows.followerId, viewerId), eq(userFollows.status, "accepted")));
  return new Set(rows.map((r) => r.followedId));
}

/**
 * Exponential-style decay from 1 → 0 over `halfLifeHours`.
 * Returns a value in [0, 1] where 1 = brand new, 0 = older than the window.
 */
export function recencyDecay(createdAt: string | Date, halfLifeHours: number): number {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  return Math.max(0, 1 - ageHours / halfLifeHours);
}

/** Score a discover-round item. */
export function scoreDiscoverRound(opts: {
  hostId: string;
  confirmedPlayerIds: string[];
  confirmedCount: number;
  totalSpots: number;
  followedIds: Set<string>;
}): number {
  let score = 0;

  if (opts.followedIds.has(opts.hostId)) score += 30;

  let socialPlayerBoost = 0;
  for (const pid of opts.confirmedPlayerIds) {
    if (opts.followedIds.has(pid)) socialPlayerBoost += 15;
    if (socialPlayerBoost >= 45) break;
  }
  score += socialPlayerBoost;

  const fillRate = opts.totalSpots > 0 ? opts.confirmedCount / opts.totalSpots : 0;
  score += fillRate * 20;

  return score;
}

/** Score a discover-group item. */
export function scoreDiscoverGroup(opts: {
  memberCount: number;
  followerOverlap: number;
  recentActivityCount: number;
}): number {
  let score = 0;

  score += Math.min(opts.followerOverlap * 20, 60);

  score += Math.min(opts.recentActivityCount, 25);

  if (opts.memberCount > 0) {
    score += Math.min(Math.log2(opts.memberCount) * 3, 15);
  }

  return score;
}

/** Score a group-activity post item (formerly "announcement"). */
export function scorePost(opts: {
  likeCount: number;
  commentCount: number;
  createdAt: string;
  authorId: string;
  followedIds: Set<string>;
}): number {
  const engagement = opts.likeCount * 2 + opts.commentCount * 3;
  const decay = recencyDecay(opts.createdAt, 168); // 7 days
  const socialBoost = opts.followedIds.has(opts.authorId) ? 10 : 0;
  return engagement * decay + socialBoost;
}
