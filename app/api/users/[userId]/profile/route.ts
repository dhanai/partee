import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { userFollows, users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";

type RouteContext = {
  params: { userId: string };
};

function relationshipState(input: {
  self: boolean;
  outgoingStatus: "requested" | "accepted" | null;
  incomingStatus: "requested" | "accepted" | null;
}) {
  if (input.self) return "self" as const;
  if (input.outgoingStatus === "accepted" && input.incomingStatus === "accepted") {
    return "mutual" as const;
  }
  if (input.outgoingStatus === "accepted") return "following" as const;
  if (input.incomingStatus === "accepted") return "followed_by" as const;
  if (input.outgoingStatus === "requested") return "requested_by_viewer" as const;
  if (input.incomingStatus === "requested") return "requested_to_viewer" as const;
  return "none" as const;
}

export async function GET(req: Request, { params }: RouteContext) {
  try {
    const viewer = await requireDbUser(req);
    const targetUserId = params.userId;

    const [target] = await db
      .select({
        id: users.id,
        name: users.name,
        avatar: users.avatar,
        handicap: users.handicap,
        location: users.homeCourse,
        followVisibility: users.followVisibility,
      })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!target) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const self = viewer.id === target.id;

    const [outgoingFollow] = await db
      .select({ status: userFollows.status })
      .from(userFollows)
      .where(and(eq(userFollows.followerId, viewer.id), eq(userFollows.followedId, target.id)))
      .limit(1);
    const [incomingFollow] = await db
      .select({ status: userFollows.status })
      .from(userFollows)
      .where(and(eq(userFollows.followerId, target.id), eq(userFollows.followedId, viewer.id)))
      .limit(1);

    const [followerCountRows, followingCountRows] = await Promise.all([
      db
        .select({
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(userFollows)
        .where(and(eq(userFollows.followedId, target.id), eq(userFollows.status, "accepted"))),
      db
        .select({
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(userFollows)
        .where(and(eq(userFollows.followerId, target.id), eq(userFollows.status, "accepted"))),
    ]);

    /** Same semantics as GET /api/users/me/network: people this user follows (accepted outgoing only). */
    const followRows = await db
      .select({
        id: users.id,
        name: users.name,
        avatar: users.avatar,
        handicap: users.handicap,
      })
      .from(userFollows)
      .innerJoin(users, eq(users.id, userFollows.followedId))
      .where(and(eq(userFollows.followerId, target.id), eq(userFollows.status, "accepted")));

    const byFollowing = new Map<
      string,
      { id: string; name: string; avatar: string | null; handicap: string | null }
    >();
    for (const row of followRows) {
      if (row.id === target.id) continue;
      if (byFollowing.has(row.id)) continue;
      const h = row.handicap != null && row.handicap !== "" ? String(row.handicap) : null;
      byFollowing.set(row.id, {
        id: row.id,
        name: row.name,
        avatar: row.avatar,
        handicap: h,
      });
    }
    const friends = Array.from(byFollowing.values()).sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      user: {
        ...target,
        relationship: relationshipState({
          self,
          outgoingStatus: outgoingFollow?.status ?? null,
          incomingStatus: incomingFollow?.status ?? null,
        }),
        followersCount: followerCountRows[0]?.count ?? 0,
        followingCount: followingCountRows[0]?.count ?? 0,
      },
      friends,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to load public profile." }, { status: 500 });
  }
}
