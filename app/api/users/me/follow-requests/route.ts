import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { userFollows, users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const viewer = await requireDbUser(req);

    const requests = await db
      .select({
        id: userFollows.id,
        followerId: users.id,
        name: users.name,
        avatar: users.avatar,
        createdAt: userFollows.createdAt,
      })
      .from(userFollows)
      .innerJoin(users, eq(users.id, userFollows.followerId))
      .where(and(eq(userFollows.followedId, viewer.id), eq(userFollows.status, "requested")));

    return NextResponse.json({ requests });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to load follow requests." }, { status: 500 });
  }
}
