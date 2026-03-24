import { NextResponse } from "next/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { courses, roundMessages, rounds, spots, users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { resolveRoundImageUrl } from "@/lib/round-images";

export async function GET(req: Request) {
  try {
    const user = await requireDbUser(req);

    const hostRoundIds = db
      .select({ id: rounds.id })
      .from(rounds)
      .where(eq(rounds.hostId, user.id));

    const confirmedRoundIds = db
      .select({ id: spots.roundId })
      .from(spots)
      .where(and(eq(spots.userId, user.id), eq(spots.status, "confirmed")));

    const latestMsgSubquery = db
      .select({
        roundId: roundMessages.roundId,
        lastCreatedAt: sql<string>`MAX(${roundMessages.createdAt})`.as("last_created_at"),
      })
      .from(roundMessages)
      .groupBy(roundMessages.roundId)
      .as("latest_msg");

    const hostAvatarSubquery = sql<string | null>`(SELECT ${users.avatar} FROM ${users} WHERE ${users.id} = ${rounds.hostId})`;

    const rows = await db
      .select({
        roundId: rounds.id,
        inviteToken: rounds.inviteToken,
        mode: rounds.mode,
        courseName: rounds.courseName,
        targetDate: rounds.targetDate,
        courseId: rounds.courseId,
        customImageUrl: rounds.customImageUrl,
        hostAvatar: hostAvatarSubquery,
        lastMessageAt: latestMsgSubquery.lastCreatedAt,
        lastMsgBody: roundMessages.body,
        lastMsgSenderName: users.name,
      })
      .from(rounds)
      .innerJoin(latestMsgSubquery, eq(latestMsgSubquery.roundId, rounds.id))
      .innerJoin(
        roundMessages,
        and(
          eq(roundMessages.roundId, rounds.id),
          eq(roundMessages.createdAt, latestMsgSubquery.lastCreatedAt),
        ),
      )
      .innerJoin(users, eq(users.id, roundMessages.userId))
      .where(
        sql`${rounds.id} IN (${hostRoundIds}) OR ${rounds.id} IN (${confirmedRoundIds})`,
      )
      .orderBy(desc(latestMsgSubquery.lastCreatedAt));

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

    const chats = rows.map((r) => {
      const roundImage = resolveRoundImageUrl({
        customImageUrl: r.customImageUrl ?? undefined,
        courseMetadata: r.courseId ? metaById.get(r.courseId) : null,
      });
      let title = r.courseName ?? "Course TBD";
      if (r.mode === "planning" && !r.courseName && r.targetDate) {
        title = new Date(r.targetDate).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        });
      }
      return {
      inviteToken: r.inviteToken,
      courseName: title,
      imageUrl: roundImage ?? r.hostAvatar ?? null,
      lastChatMessage: {
        body: r.lastMsgBody,
        senderName: r.lastMsgSenderName,
        createdAt: new Date(r.lastMessageAt).toISOString(),
      },
    };
    });

    return NextResponse.json({ chats });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(error);
    return NextResponse.json({ error: "Unable to load chats." }, { status: 500 });
  }
}
