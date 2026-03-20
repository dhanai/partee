import { NextResponse } from "next/server";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { courses, rounds, spots, users } from "@/db/schema";
import { orderConfirmedPlayersHostFirstByClaimOrder } from "@/lib/confirmed-players-order";
import { requireDbUser } from "@/lib/auth";
import { resolveRoundImageUrl } from "@/lib/round-images";

type MineRowWithImageFields = {
  courseId: string | null;
  customImageUrl: string | null;
};

async function enrichMineRoundsWithImageUrl<T extends MineRowWithImageFields>(
  rows: T[],
): Promise<Array<Omit<T, "courseId" | "customImageUrl"> & { imageUrl: string }>> {
  const courseIds = [
    ...new Set(rows.map((r) => r.courseId).filter((id): id is string => Boolean(id))),
  ];
  const metaById = new Map<string, Record<string, unknown>>();
  if (courseIds.length > 0) {
    const cRows = await db
      .select({ id: courses.id, metadata: courses.metadata })
      .from(courses)
      .where(inArray(courses.id, courseIds));
    for (const row of cRows) {
      metaById.set(row.id, row.metadata as Record<string, unknown>);
    }
  }
  return rows.map((r) => {
    const { courseId, customImageUrl, ...rest } = r;
    const imageUrl = resolveRoundImageUrl({
      customImageUrl: customImageUrl ?? undefined,
      courseMetadata: courseId ? metaById.get(courseId) : null,
    });
    return { ...rest, imageUrl };
  });
}

export async function GET(req: Request) {
  try {
    const user = await requireDbUser(req);
    const { searchParams } = new URL(req.url);
    const tab = searchParams.get("tab");
    const parsedLimit = Number(searchParams.get("limit") ?? "20");
    const parsedCursor = Number(searchParams.get("cursor") ?? "0");
    const includeInvitedSpots =
      searchParams.get("includeInvited") === "1" ||
      searchParams.get("includeInvited") === "true";
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
        joinPolicy: rounds.joinPolicy,
        customImageUrl: rounds.customImageUrl,
        courseId: rounds.courseId,
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

    const joinedSpotStatuses = includeInvitedSpots
      ? (["confirmed", "requested", "invited"] as const)
      : (["confirmed", "requested"] as const);

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
        totalSpots: rounds.totalSpots,
        joinPolicy: rounds.joinPolicy,
        customImageUrl: rounds.customImageUrl,
        courseId: rounds.courseId,
        hostId: rounds.hostId,
        spotStatus: spots.status,
      })
      .from(spots)
      .innerJoin(rounds, eq(rounds.id, spots.roundId))
      .where(
        and(
          eq(spots.userId, user.id),
          ne(rounds.hostId, user.id),
          inArray(spots.status, joinedSpotStatuses),
        ),
      )
      .orderBy(asc(rounds.targetDate));

    const invitedOnly = await db
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
        joinPolicy: rounds.joinPolicy,
        customImageUrl: rounds.customImageUrl,
        courseId: rounds.courseId,
        hostId: rounds.hostId,
        spotStatus: spots.status,
      })
      .from(spots)
      .innerJoin(rounds, eq(rounds.id, spots.roundId))
      .where(
        and(
          eq(spots.userId, user.id),
          ne(rounds.hostId, user.id),
          eq(spots.status, "invited"),
        ),
      )
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
              claimedAt: spots.createdAt,
            })
            .from(spots)
            .innerJoin(users, eq(users.id, spots.userId))
            .where(
              and(
                inArray(spots.roundId, hostingRoundIds),
                eq(spots.status, "confirmed"),
              ),
            )
            .orderBy(asc(spots.roundId), asc(spots.createdAt));

    const confirmedByRound = new Map<
      string,
      Array<{ id: string; name: string; avatar: string | null; claimedAt: Date }>
    >();
    for (const row of confirmedRows) {
      const existing = confirmedByRound.get(row.roundId) ?? [];
      existing.push({
        id: row.userId,
        name: row.name,
        avatar: row.avatar,
        claimedAt: row.claimedAt,
      });
      confirmedByRound.set(row.roundId, existing);
    }

    const hostingPayload = await enrichMineRoundsWithImageUrl(
      hostingUpcoming.map((round) => ({
        ...round,
        confirmedPlayers: orderConfirmedPlayersHostFirstByClaimOrder(
          confirmedByRound.get(round.id) ?? [],
          user.id,
        ),
      })),
    );

    const joinedUpcomingRows = joined.filter(
      (r) => new Date(r.teeTime ?? r.targetDate) >= now,
    );
    const invitedUpcomingRows = invitedOnly.filter(
      (r) => new Date(r.teeTime ?? r.targetDate) >= now,
    );
    const guestRoundIdList = [
      ...new Set([...joinedUpcomingRows.map((r) => r.id), ...invitedUpcomingRows.map((r) => r.id)]),
    ];

    const guestConfirmedRows =
      guestRoundIdList.length === 0
        ? []
        : await db
            .select({
              roundId: spots.roundId,
              userId: users.id,
              name: users.name,
              avatar: users.avatar,
              claimedAt: spots.createdAt,
            })
            .from(spots)
            .innerJoin(users, eq(users.id, spots.userId))
            .where(
              and(inArray(spots.roundId, guestRoundIdList), eq(spots.status, "confirmed")),
            )
            .orderBy(asc(spots.roundId), asc(spots.createdAt));

    const guestConfirmedByRound = new Map<
      string,
      Array<{ id: string; name: string; avatar: string | null; claimedAt: Date }>
    >();
    for (const row of guestConfirmedRows) {
      const existing = guestConfirmedByRound.get(row.roundId) ?? [];
      existing.push({
        id: row.userId,
        name: row.name,
        avatar: row.avatar,
        claimedAt: row.claimedAt,
      });
      guestConfirmedByRound.set(row.roundId, existing);
    }

    const joinedPayload = await enrichMineRoundsWithImageUrl(
      sortByEffectiveDate(
        joinedUpcomingRows.map((round) => ({
          ...round,
          confirmedPlayers: orderConfirmedPlayersHostFirstByClaimOrder(
            guestConfirmedByRound.get(round.id) ?? [],
            round.hostId,
          ),
        })),
      ),
    );
    const invitedPayload = await enrichMineRoundsWithImageUrl(
      sortByEffectiveDate(
        invitedUpcomingRows.map((round) => ({
          ...round,
          confirmedPlayers: orderConfirmedPlayersHostFirstByClaimOrder(
            guestConfirmedByRound.get(round.id) ?? [],
            round.hostId,
          ),
        })),
      ),
    );

    if (tab === "hosting" || tab === "joined" || tab === "invited") {
      const source =
        tab === "hosting" ? hostingPayload : tab === "joined" ? joinedPayload : invitedPayload;
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
      invited: {
        upcoming: invitedPayload,
        past: sortByEffectiveDate(
          invitedOnly.filter((r) => new Date(r.teeTime ?? r.targetDate) < now),
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
