import { NextResponse } from "next/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { chatReadReceipts, courses, roundMessages, rounds, spots, users } from "@/db/schema";
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

    const rows = await db
      .select({
        roundId: rounds.id,
        hostId: rounds.hostId,
        inviteToken: rounds.inviteToken,
        mode: rounds.mode,
        courseName: rounds.courseName,
        teeTime: rounds.teeTime,
        targetDate: rounds.targetDate,
        courseId: rounds.courseId,
        customImageUrl: rounds.customImageUrl,
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

    const roundIds = rows.map((r) => r.roundId);
    const avatarsByRound = new Map<string, string[]>();
    if (roundIds.length > 0) {
      const spotRows = await db
        .select({
          roundId: spots.roundId,
          avatar: users.avatar,
        })
        .from(spots)
        .innerJoin(users, eq(users.id, spots.userId))
        .where(
          and(eq(spots.status, "confirmed"), inArray(spots.roundId, roundIds)),
        );
      for (const sr of spotRows) {
        if (!sr.avatar) continue;
        const list = avatarsByRound.get(sr.roundId) ?? [];
        list.push(sr.avatar);
        avatarsByRound.set(sr.roundId, list);
      }
      const hostRows = await db
        .select({ id: users.id, avatar: users.avatar })
        .from(users)
        .where(inArray(users.id, [...new Set(rows.map((r) => r.hostId))]));
      const hostAvatarById = new Map(hostRows.map((h) => [h.id, h.avatar]));
      for (const r of rows) {
        const hostAv = hostAvatarById.get(r.hostId);
        if (!hostAv) continue;
        const list = avatarsByRound.get(r.roundId) ?? [];
        if (!list.includes(hostAv)) list.unshift(hostAv);
        avatarsByRound.set(r.roundId, list);
      }
    }

    const readReceiptMap = new Map<string, Date>();
    if (roundIds.length > 0) {
      const receipts = await db
        .select({ roundId: chatReadReceipts.roundId, lastReadAt: chatReadReceipts.lastReadAt })
        .from(chatReadReceipts)
        .where(
          and(eq(chatReadReceipts.userId, user.id), inArray(chatReadReceipts.roundId, roundIds)),
        );
      for (const rc of receipts) {
        readReceiptMap.set(rc.roundId, rc.lastReadAt);
      }
    }

    const chats = rows.map((r) => {
      const hasCourseImage = r.customImageUrl?.trim() || (r.courseId && metaById.has(r.courseId));
      const roundImage = hasCourseImage
        ? resolveRoundImageUrl({
            customImageUrl: r.customImageUrl ?? undefined,
            courseMetadata: r.courseId ? metaById.get(r.courseId) : null,
          })
        : null;
      const dateFmt = (d: Date) =>
        d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

      let title: string;
      if (r.mode === "planning" && !r.courseName) {
        title = r.targetDate ? dateFmt(new Date(r.targetDate)) : "Round TBD";
      } else {
        const shortName = (r.courseName ?? "")
          .replace(/\b(golf\s+)?(course|club|country\s+club|links|resort)\b/gi, "")
          .replace(/\s{2,}/g, " ")
          .trim();
        const dateStr = r.teeTime
          ? dateFmt(new Date(r.teeTime))
          : r.targetDate
            ? dateFmt(new Date(r.targetDate))
            : null;
        title = dateStr ? `${shortName || r.courseName} · ${dateStr}` : (shortName || r.courseName || "Course TBD");
      }
      const playerAvatars = avatarsByRound.get(r.roundId) ?? [];
      const msgIso = new Date(r.lastMessageAt).toISOString();
      const lastRead = readReceiptMap.get(r.roundId);
      const isUnread = !lastRead || new Date(r.lastMessageAt).getTime() > lastRead.getTime();

      return {
        inviteToken: r.inviteToken,
        courseName: title,
        imageUrl: roundImage,
        playerAvatars: !roundImage ? playerAvatars.slice(0, 3) : [],
        isUnread,
        lastChatMessage: {
          body: r.lastMsgBody,
          senderName: r.lastMsgSenderName,
          createdAt: msgIso,
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
