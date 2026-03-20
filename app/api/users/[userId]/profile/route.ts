import { NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { rounds, spots, userFollows, users } from "@/db/schema";
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

    const [hostedRoundRows, joinedRoundRows] = await Promise.all([
      db.select({ id: rounds.id }).from(rounds).where(eq(rounds.hostId, target.id)),
      db
        .select({ roundId: spots.roundId })
        .from(spots)
        .where(and(eq(spots.userId, target.id), eq(spots.status, "confirmed"))),
    ]);
    const roundIds = Array.from(
      new Set([
        ...hostedRoundRows.map((row) => row.id),
        ...joinedRoundRows.map((row) => row.roundId),
      ]),
    );

    let friends: Array<{ id: string; name: string; avatar: string | null; handicap: string | null }> =
      [];
    if (roundIds.length > 0) {
      const [peerSpotRows, hostRows] = await Promise.all([
        db
          .select({
            id: users.id,
            name: users.name,
            avatar: users.avatar,
            handicap: users.handicap,
          })
          .from(spots)
          .innerJoin(users, eq(users.id, spots.userId))
          .where(
            and(
              inArray(spots.roundId, roundIds),
              eq(spots.status, "confirmed"),
            ),
          ),
        db
          .select({
            id: users.id,
            name: users.name,
            avatar: users.avatar,
            handicap: users.handicap,
          })
          .from(rounds)
          .innerJoin(users, eq(users.id, rounds.hostId))
          .where(inArray(rounds.id, roundIds)),
      ]);

      const byUser = new Map<
        string,
        { id: string; name: string; avatar: string | null; handicap: string | null }
      >();
      for (const row of [...peerSpotRows, ...hostRows]) {
        if (row.id === target.id) continue;
        if (byUser.has(row.id)) continue;
        const h = row.handicap != null && row.handicap !== "" ? String(row.handicap) : null;
        byUser.set(row.id, {
          id: row.id,
          name: row.name,
          avatar: row.avatar,
          handicap: h,
        });
      }
      friends = Array.from(byUser.values()).sort((a, b) => a.name.localeCompare(b.name));
    }

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
