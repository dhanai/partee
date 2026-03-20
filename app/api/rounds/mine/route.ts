import { NextResponse } from "next/server";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { rounds, spots, users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const user = await requireDbUser(req);
    const { searchParams } = new URL(req.url);
    const tab = searchParams.get("tab");
    const parsedLimit = Number(searchParams.get("limit") ?? "20");
    const parsedCursor = Number(searchParams.get("cursor") ?? "0");
    const limit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(100, Math.trunc(parsedLimit)))
      : 20;
    const cursor = Number.isFinite(parsedCursor) ? Math.max(0, Math.trunc(parsedCursor)) : 0;
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
        planningLocation: rounds.planningLocation,
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
      .orderBy(asc(rounds.targetDate));

    const joined = await db
      .select({
        id: rounds.id,
        inviteToken: rounds.inviteToken,
        courseName: rounds.courseName,
        teeTime: rounds.teeTime,
        targetDate: rounds.targetDate,
        mode: rounds.mode,
        preferredTimeWindow: rounds.preferredTimeWindow,
        planningLocation: rounds.planningLocation,
        status: rounds.status,
        spotStatus: spots.status,
      })
      .from(spots)
      .innerJoin(rounds, eq(rounds.id, spots.roundId))
      .where(and(eq(spots.userId, user.id), ne(rounds.hostId, user.id)))
      .orderBy(asc(rounds.targetDate));

    const sortByEffectiveDate = <T extends { teeTime: Date | null; targetDate: Date }>(
      items: T[],
    ) =>
      [...items].sort(
        (a, b) =>
          new Date(a.teeTime ?? a.targetDate).getTime() -
          new Date(b.teeTime ?? b.targetDate).getTime(),
      );

    const hostingUpcoming = sortByEffectiveDate(
      hosting.filter((r) => new Date(r.teeTime ?? r.targetDate) >= now),
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

    const hostingPayload = hostingUpcoming.map((round) => ({
      ...round,
      confirmedPlayers: confirmedByRound.get(round.id) ?? [],
    }));
    const joinedPayload = sortByEffectiveDate(
      joined.filter((r) => new Date(r.teeTime ?? r.targetDate) >= now),
    );

    if (tab === "hosting" || tab === "joined") {
      const source = tab === "hosting" ? hostingPayload : joinedPayload;
      const roundsPage = source.slice(cursor, cursor + limit);
      const nextCursor = cursor + limit < source.length ? String(cursor + limit) : null;
      return NextResponse.json({
        tab,
        rounds: roundsPage,
        nextCursor,
        hasMore: nextCursor !== null,
      });
    }

    return NextResponse.json({
      hosting: {
        upcoming: hostingPayload,
        past: sortByEffectiveDate(
          hosting.filter((r) => new Date(r.teeTime ?? r.targetDate) < now),
        ),
      },
      joined: {
        upcoming: joinedPayload,
        past: sortByEffectiveDate(
          joined.filter((r) => new Date(r.teeTime ?? r.targetDate) < now),
        ),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to load user rounds." }, { status: 500 });
  }
}
