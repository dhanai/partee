import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { userFollows, users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { relationshipViewerToUser } from "@/lib/follow-relationship";

type RouteContext = {
  params: { userId: string };
};

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
        relationship: relationshipViewerToUser({
          viewerId: viewer.id,
          targetUserId: target.id,
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
