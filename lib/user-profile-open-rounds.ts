import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { courses, rounds, spots, users } from "@/db/schema";
import { orderConfirmedPlayersHostFirstByClaimOrder } from "@/lib/confirmed-players-order";
import { resolveRoundImageUrl } from "@/lib/round-images";
import { timeWindowResponseFields } from "@/lib/round-time-window-compat";
import { effectiveRoundTimeMs, toIsoTimestamp } from "@/lib/utils";

type RowWithCourse = {
  id: string;
  inviteToken: string;
  courseName: string | null;
  teeTime: Date | string | null;
  targetDate: Date | string;
  mode: "scheduled" | "planning";
  preferredTimeWindow: string[] | null;
  planningLocation: string | null;
  status: "forming" | "confirmed" | "completed";
  totalSpots: number;
  joinPolicy: "instant" | "approval";
  customImageUrl: string | null;
  courseId: string | null;
  confirmedCount: number;
};

async function enrichWithImageUrl(rows: RowWithCourse[]) {
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
    const { courseId, customImageUrl, preferredTimeWindow, ...rest } = r;
    const imageUrl = resolveRoundImageUrl({
      customImageUrl: customImageUrl ?? undefined,
      courseMetadata: courseId ? metaById.get(courseId) : null,
    });
    return {
      ...rest,
      ...timeWindowResponseFields(preferredTimeWindow),
      imageUrl,
    };
  });
}

export type ProfileOpenRoundJson = {
  id: string;
  inviteToken: string;
  courseName: string | null;
  mode: "scheduled" | "planning";
  teeTime: string | null;
  targetDate: string;
  imageUrl: string;
  totalSpots: number;
  spotsRemaining: number;
  joinPolicy: "instant" | "approval";
  preferredTimeWindow: string | null;
  preferredTimeWindows: string[] | null;
  planningLocation: string | null;
  confirmedPlayers: Array<{ id: string; name: string; avatar: string | null }>;
};

/**
 * Hosted rounds that are still "open" in time (effective tee/target strictly after now),
 * including when full. Others only see public rounds; the host sees their public + private.
 */
export async function getHostedOpenRoundsForProfile(
  hostUserId: string,
  viewerUserId: string,
): Promise<ProfileOpenRoundJson[]> {
  const futureCond = sql`coalesce(${rounds.teeTime}, ${rounds.targetDate}) > NOW()`;

  const conditions = [
    eq(rounds.hostId, hostUserId),
    isNull(rounds.groupId),
    inArray(rounds.status, ["forming", "confirmed"]),
    futureCond,
  ];
  if (viewerUserId !== hostUserId) {
    conditions.push(eq(rounds.visibility, "public"));
  }

  const rawRows = await db
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
    .where(and(...conditions))
    .groupBy(rounds.id)
    .orderBy(asc(rounds.targetDate));

  const nowMs = Date.now();
  const upcoming = rawRows.filter((r) => effectiveRoundTimeMs(r) > nowMs);
  if (upcoming.length === 0) return [];

  const roundIds = upcoming.map((r) => r.id);
  const confirmedRows = await db
    .select({
      roundId: spots.roundId,
      userId: users.id,
      name: users.name,
      avatar: users.avatar,
      claimedAt: spots.createdAt,
    })
    .from(spots)
    .innerJoin(users, eq(users.id, spots.userId))
    .where(and(inArray(spots.roundId, roundIds), eq(spots.status, "confirmed")))
    .orderBy(asc(spots.roundId), asc(spots.createdAt));

  const byRound = new Map<
    string,
    Array<{ userId: string; name: string; avatar: string | null; claimedAt: Date | string }>
  >();
  for (const row of confirmedRows) {
    const list = byRound.get(row.roundId) ?? [];
    list.push({
      userId: row.userId,
      name: row.name,
      avatar: row.avatar,
      claimedAt: row.claimedAt,
    });
    byRound.set(row.roundId, list);
  }

  const enriched = await enrichWithImageUrl(upcoming);

  return enriched.map((r) => {
    const players = orderConfirmedPlayersHostFirstByClaimOrder(
      (byRound.get(r.id) ?? []).map((p) => ({
        id: p.userId,
        name: p.name,
        avatar: p.avatar,
        claimedAt: p.claimedAt,
      })),
      hostUserId,
    );
    const confirmed = players.length;
    const spotsRemaining = Math.max(0, r.totalSpots - confirmed);
    return {
      id: r.id,
      inviteToken: r.inviteToken,
      courseName: r.courseName,
      mode: r.mode,
      teeTime: r.teeTime ? toIsoTimestamp(r.teeTime) : null,
      targetDate: toIsoTimestamp(r.targetDate),
      imageUrl: r.imageUrl,
      totalSpots: r.totalSpots,
      spotsRemaining,
      joinPolicy: r.joinPolicy,
      preferredTimeWindow: r.preferredTimeWindow,
      preferredTimeWindows: r.preferredTimeWindows,
      planningLocation: r.planningLocation,
      confirmedPlayers: players,
    };
  });
}
