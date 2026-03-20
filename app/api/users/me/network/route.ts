import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { userFollows, users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";

/**
 * "Friends" for invites / network = people **you** follow (accepted outgoing only).
 * - Round co-players are excluded (so past rounds don't keep someone listed).
 * - If someone only follows you, they won't appear here until you follow back.
 * - Unfollow deletes your row → they drop off immediately.
 */
export async function GET(req: Request) {
  try {
    const currentUser = await requireDbUser(req);

    const followRows = await db
      .select({
        id: users.id,
        name: users.name,
        avatar: users.avatar,
        handicap: users.handicap,
      })
      .from(userFollows)
      .innerJoin(users, eq(users.id, userFollows.followedId))
      .where(
        and(eq(userFollows.followerId, currentUser.id), eq(userFollows.status, "accepted")),
      );

    type FriendRow = {
      id: string;
      name: string;
      avatar: string | null;
      handicap: string | null;
    };

    function handicapToString(value: string | null | undefined): string | null {
      if (value == null || value === "") return null;
      return String(value);
    }

    const byUser = new Map<string, FriendRow>();
    for (const row of followRows) {
      if (row.id === currentUser.id) continue;
      if (byUser.has(row.id)) continue;
      byUser.set(row.id, {
        id: row.id,
        name: row.name,
        avatar: row.avatar,
        handicap: handicapToString(row.handicap ?? undefined),
      });
    }

    const friends = Array.from(byUser.values()).sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ friends });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to load profile network." }, { status: 500 });
  }
}
