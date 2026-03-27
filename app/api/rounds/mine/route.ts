import { NextResponse } from "next/server";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversationReadReceipts, conversations, courses, messages, rounds, spots, users } from "@/db/schema";
import { orderConfirmedPlayersHostFirstByClaimOrder } from "@/lib/confirmed-players-order";
import { requireDbUser } from "@/lib/auth";
import { resolveRoundImageUrl } from "@/lib/round-images";
import { timeWindowResponseFields } from "@/lib/round-time-window-compat";
import { effectiveRoundTimeMs } from "@/lib/utils";

type MineRowWithImageFields = {
  courseId: string | null;
  customImageUrl: string | null;
};

async function enrichMineRoundsWithImageUrl<T extends MineRowWithImageFields & { preferredTimeWindow: string[] | null }>(
  rows: T[],
): Promise<Array<Omit<T, "courseId" | "customImageUrl"> & { imageUrl: string; preferredTimeWindow: string | null; preferredTimeWindows: string[] | null }>> {
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
    return { ...rest, ...timeWindowResponseFields(r.preferredTimeWindow), imageUrl };
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

    const conversationIdSubquery = sql<string | null>`(
      SELECT ${conversations.id}
      FROM ${conversations}
      WHERE ${conversations.roundId} = ${rounds.id} AND ${conversations.type} = 'round'
      LIMIT 1
    )`;

    const lastChatSubquery = sql<string | null>`(
      SELECT MAX(${messages.createdAt})
      FROM ${messages}
      INNER JOIN ${conversations} ON ${conversations.id} = ${messages.conversationId}
      WHERE ${conversations.roundId} = ${rounds.id} AND ${conversations.type} = 'round'
    )`;

    const isChatUnreadSubquery = sql<boolean>`(
      SELECT CASE
        WHEN lm.last_msg IS NULL THEN false
        WHEN lm.last_sender = ${sql.raw(`'${user.id}'`)} THEN false
        WHEN lr.last_read IS NULL THEN true
        WHEN lm.last_msg > lr.last_read THEN true
        ELSE false
      END
      FROM (
        SELECT MAX(${messages.createdAt}) AS last_msg,
          (SELECT m3.user_id FROM ${messages} m3
           INNER JOIN ${conversations} c3 ON c3.id = m3.conversation_id
           WHERE c3.round_id = ${rounds.id} AND c3.type = 'round'
           ORDER BY m3.created_at DESC LIMIT 1) AS last_sender
        FROM ${messages}
        INNER JOIN ${conversations} ON ${conversations.id} = ${messages.conversationId}
        WHERE ${conversations.roundId} = ${rounds.id} AND ${conversations.type} = 'round'
      ) lm,
      (
        SELECT MAX(${conversationReadReceipts.lastReadAt}) AS last_read
        FROM ${conversationReadReceipts}
        INNER JOIN ${conversations} ON ${conversations.id} = ${conversationReadReceipts.conversationId}
        WHERE ${conversationReadReceipts.userId} = ${sql.raw(`'${user.id}'`)}
          AND ${conversations.roundId} = ${rounds.id} AND ${conversations.type} = 'round'
      ) lr
    )`.mapWith(Boolean);

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
        conversationId: conversationIdSubquery,
        lastChatMessageAt: lastChatSubquery,
        isChatUnread: isChatUnreadSubquery,
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
        conversationId: conversationIdSubquery,
        lastChatMessageAt: lastChatSubquery,
        isChatUnread: isChatUnreadSubquery,
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
        conversationId: conversationIdSubquery,
        lastChatMessageAt: lastChatSubquery,
        isChatUnread: isChatUnreadSubquery,
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

    const sortByEffectiveDate = <
      T extends { teeTime: Date | string | null; targetDate: Date | string | null },
    >(
      items: T[],
    ) => [...items].sort((a, b) => effectiveRoundTimeMs(a) - effectiveRoundTimeMs(b));

    /** One row per round (duplicate spot rows for the same user+round would otherwise duplicate keys in the app). */
    function dedupeGuestRowsByRoundId<T extends { id: string }>(rows: T[]): T[] {
      const seen = new Set<string>();
      const out: T[] = [];
      for (const row of rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        out.push(row);
      }
      return out;
    }

    const nowMs = now.getTime();
    const hostingUpcoming = sortByEffectiveDate(
      hosting.filter((r) => effectiveRoundTimeMs(r) >= nowMs),
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
      Array<{ id: string; name: string; avatar: string | null; claimedAt: Date | string }>
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

    const joinedUpcomingRows = dedupeGuestRowsByRoundId(
      joined.filter((r) => effectiveRoundTimeMs(r) >= nowMs),
    );
    const invitedUpcomingRows = dedupeGuestRowsByRoundId(
      invitedOnly.filter((r) => effectiveRoundTimeMs(r) >= nowMs),
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
      Array<{ id: string; name: string; avatar: string | null; claimedAt: Date | string }>
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

    const addTimeWindowCompat = <T extends { preferredTimeWindow: string[] | null }>(rows: T[]) =>
      rows.map((r) => ({ ...r, ...timeWindowResponseFields(r.preferredTimeWindow) }));

    return NextResponse.json({
      hosting: {
        upcoming: hostingPayload,
        past: addTimeWindowCompat(sortByEffectiveDate(hosting.filter((r) => effectiveRoundTimeMs(r) < nowMs))),
      },
      joined: {
        upcoming: joinedPayload,
        past: addTimeWindowCompat(sortByEffectiveDate(joined.filter((r) => effectiveRoundTimeMs(r) < nowMs))),
      },
      invited: {
        upcoming: invitedPayload,
        past: addTimeWindowCompat(sortByEffectiveDate(invitedOnly.filter((r) => effectiveRoundTimeMs(r) < nowMs))),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(error);
    return NextResponse.json({ error: "Unable to load user rounds." }, { status: 500 });
  }
}
