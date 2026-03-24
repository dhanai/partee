import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { userFollows, users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const viewer = await requireDbUser(req);

    const mutualFriends = await db
      .select({
        id: users.id,
        name: users.name,
        avatar: users.avatar,
        handicap: users.handicap,
      })
      .from(userFollows)
      .innerJoin(
        sql`"user_follows" AS "reverse"`,
        sql`"reverse"."follower_id" = ${userFollows.followedId}
          AND "reverse"."followed_id" = ${userFollows.followerId}
          AND "reverse"."status" = 'accepted'`,
      )
      .innerJoin(users, eq(users.id, userFollows.followedId))
      .where(
        and(eq(userFollows.followerId, viewer.id), eq(userFollows.status, "accepted")),
      )
      .orderBy(users.name);

    return NextResponse.json({
      friends: mutualFriends.map((f) => ({
        id: f.id,
        name: f.name,
        avatar: f.avatar,
        handicap: f.handicap,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[GET /api/users/me/friends]", error);
    return NextResponse.json({ error: "Unable to load friends." }, { status: 500 });
  }
}
