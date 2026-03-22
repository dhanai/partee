import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { userFollows, users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { toIsoTimestamp } from "@/lib/utils";

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

    const mapped = requests.flatMap((r) => {
      try {
        return [
          {
            id: r.id,
            followerId: r.followerId,
            name: r.name,
            avatar: r.avatar,
            createdAt: toIsoTimestamp(r.createdAt),
          },
        ];
      } catch (rowErr) {
        console.error("follow-requests: skip row", r.id, rowErr);
        return [];
      }
    });

    return NextResponse.json({ requests: mapped });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(error);
    return NextResponse.json({ error: "Unable to load follow requests." }, { status: 500 });
  }
}
