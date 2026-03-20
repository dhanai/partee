import { NextResponse } from "next/server";
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { rounds, spots, userFollows, users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const currentUser = await requireDbUser(req);

    const [hostedRoundRows, joinedRoundRows] = await Promise.all([
      db
        .select({ id: rounds.id })
        .from(rounds)
        .where(eq(rounds.hostId, currentUser.id)),
      db
        .select({ roundId: spots.roundId })
        .from(spots)
        .where(and(eq(spots.userId, currentUser.id), eq(spots.status, "confirmed"))),
    ]);

    const roundIds = Array.from(
      new Set([
        ...hostedRoundRows.map((row) => row.id),
        ...joinedRoundRows.map((row) => row.roundId),
      ]),
    );

    if (roundIds.length === 0) {
      return NextResponse.json({ friends: [] });
    }

    const [peerSpotRows, hostRows, followRows] = await Promise.all([
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
      db
        .select({
          id: users.id,
          name: users.name,
          avatar: users.avatar,
          handicap: users.handicap,
        })
        .from(userFollows)
        .innerJoin(
          users,
          or(
            and(eq(userFollows.followerId, currentUser.id), eq(users.id, userFollows.followedId)),
            and(eq(userFollows.followedId, currentUser.id), eq(users.id, userFollows.followerId)),
          ),
        )
        .where(eq(userFollows.status, "accepted")),
    ]);

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
    const allRows = [...peerSpotRows, ...hostRows, ...followRows];
    for (const row of allRows) {
      if (row.id === currentUser.id) continue;
      const existing = byUser.get(row.id);
      if (existing) {
        continue;
      }
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
