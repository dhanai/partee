import { NextResponse } from "next/server";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { rounds, spots } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireDbUser();
    const now = new Date();

    const hosting = await db
      .select({
        id: rounds.id,
        inviteToken: rounds.inviteToken,
        courseName: rounds.courseName,
        teeTime: rounds.teeTime,
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
        status: rounds.status,
        spotStatus: spots.status,
      })
      .from(spots)
      .innerJoin(rounds, eq(rounds.id, spots.roundId))
      .where(and(eq(spots.userId, user.id), ne(rounds.hostId, user.id)))
      .orderBy(asc(rounds.teeTime));

    return NextResponse.json({
      hosting: {
        upcoming: hosting.filter((r) => new Date(r.teeTime) >= now),
        past: hosting.filter((r) => new Date(r.teeTime) < now),
      },
      joined: {
        upcoming: joined.filter((r) => new Date(r.teeTime) >= now),
        past: joined.filter((r) => new Date(r.teeTime) < now),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to load user rounds." }, { status: 500 });
  }
}
