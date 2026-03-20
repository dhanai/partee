import { NextResponse } from "next/server";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { rounds, spots, users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const user = await requireDbUser(req);
    const now = new Date();

    const hosting = await db
      .select({
        id: rounds.id,
        inviteToken: rounds.inviteToken,
        courseName: rounds.courseName,
        teeTime: rounds.teeTime,
        targetDate: rounds.targetDate,
        mode: rounds.mode,
        preferredTimeWindow: rounds.preferredTimeWindow,
        status: rounds.status,
        totalSpots: rounds.totalSpots,
        confirmedCount:
          sql<number>`coalesce(sum(case when ${spots.status} = 'confirmed' then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
      })
      .from(rounds)
      .leftJoin(spots, eq(spots.roundId, rounds.id))
      .where(eq(rounds.hostId, user.id))
      .groupBy(rounds.id)
      .orderBy(asc(rounds.teeTime));

    const joined = await db
      .select({
        id: rounds.id,
        inviteToken: rounds.inviteToken,
        courseName: rounds.courseName,
        teeTime: rounds.teeTime,
        targetDate: rounds.targetDate,
        mode: rounds.mode,
        preferredTimeWindow: rounds.preferredTimeWindow,
        status: rounds.status,
        spotStatus: spots.status,
      })
      .from(spots)
      .innerJoin(rounds, eq(rounds.id, spots.roundId))
      .where(and(eq(spots.userId, user.id), ne(rounds.hostId, user.id)))
      .orderBy(asc(rounds.teeTime));

    const hostingUpcoming = hosting.filter(
      (r) => new Date(r.teeTime ?? r.targetDate) >= now,
    );
    const hostingRoundIds = hostingUpcoming.map((round) => round.id);
    const confirmedRows =
      hostingRoundIds.length === 0
        ? []
        : await db
            .select({
              roundId: spots.roundId,
              userId: users.id,
              name: users.name,
              avatar: users.avatar,
            })
            .from(spots)
            .innerJoin(users, eq(users.id, spots.userId))
            .where(
              and(
                inArray(spots.roundId, hostingRoundIds),
                eq(spots.status, "confirmed"),
              ),
            )
            .orderBy(asc(spots.createdAt));

    const confirmedByRound = new Map<
      string,
      Array<{ id: string; name: string; avatar: string | null }>
    >();
    for (const row of confirmedRows) {
      const existing = confirmedByRound.get(row.roundId) ?? [];
      existing.push({
        id: row.userId,
        name: row.name,
        avatar: row.avatar,
      });
      confirmedByRound.set(row.roundId, existing);
    }

    return NextResponse.json({
      hosting: {
        upcoming: hostingUpcoming.map((round) => ({
          ...round,
          confirmedPlayers: confirmedByRound.get(round.id) ?? [],
        })),
        past: hosting.filter((r) => new Date(r.teeTime ?? r.targetDate) < now),
      },
      joined: {
        upcoming: joined.filter((r) => new Date(r.teeTime ?? r.targetDate) >= now),
        past: joined.filter((r) => new Date(r.teeTime ?? r.targetDate) < now),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to load user rounds." }, { status: 500 });
  }
}
