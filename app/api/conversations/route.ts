import { NextResponse } from "next/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  conversations,
  conversationParticipants,
  conversationReadReceipts,
  courses,
  groups,
  messages,
  rounds,
  users,
} from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { resolveRoundImageUrl } from "@/lib/round-images";

export async function GET(req: Request) {
  try {
    const viewer = await requireDbUser(req);

    const myConvIds = db
      .select({ conversationId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.userId, viewer.id));

    const latestMsgSub = db
      .select({
        conversationId: messages.conversationId,
        lastCreatedAt: sql<string>`MAX(${messages.createdAt})`.as("last_created_at"),
      })
      .from(messages)
      .groupBy(messages.conversationId)
      .as("latest_msg");

    const rows = await db
      .select({
        conversationId: conversations.id,
        type: conversations.type,
        roundId: conversations.roundId,
        groupId: conversations.groupId,
        lastMessageAt: latestMsgSub.lastCreatedAt,
        lastMsgBody: messages.body,
        lastMsgSenderId: messages.userId,
        lastMsgSenderName: users.name,
      })
      .from(conversations)
      .innerJoin(latestMsgSub, eq(latestMsgSub.conversationId, conversations.id))
      .innerJoin(
        messages,
        and(
          eq(messages.conversationId, conversations.id),
          eq(messages.createdAt, latestMsgSub.lastCreatedAt),
        ),
      )
      .innerJoin(users, eq(users.id, messages.userId))
      .where(sql`${conversations.id} IN (${myConvIds})`)
      .orderBy(desc(latestMsgSub.lastCreatedAt));

    if (rows.length === 0) {
      return NextResponse.json({ conversations: [] });
    }

    const convIds = rows.map((r) => r.conversationId);

    const groupIds = rows.map((r) => r.groupId).filter((id): id is string => Boolean(id));
    const groupNameMap = new Map<string, string>();
    const groupImageMap = new Map<string, string | null>();
    if (groupIds.length > 0) {
      const groupRows = await db
        .select({ id: groups.id, name: groups.name, imageUrl: groups.imageUrl })
        .from(groups)
        .where(inArray(groups.id, groupIds));
      for (const g of groupRows) {
        groupNameMap.set(g.id, g.name);
        groupImageMap.set(g.id, g.imageUrl);
      }
    }

    const roundIds = rows.map((r) => r.roundId).filter((id): id is string => Boolean(id));
    type RoundInfo = {
      mode: string;
      courseName: string | null;
      teeTime: Date | null;
      targetDate: Date;
      inviteToken: string;
      customImageUrl: string | null;
      courseMetadata: Record<string, unknown> | null;
    };
    const roundMap = new Map<string, RoundInfo>();
    if (roundIds.length > 0) {
      const roundRows = await db
        .select({
          id: rounds.id,
          mode: rounds.mode,
          courseName: rounds.courseName,
          teeTime: rounds.teeTime,
          targetDate: rounds.targetDate,
          inviteToken: rounds.inviteToken,
          customImageUrl: rounds.customImageUrl,
          courseId: rounds.courseId,
        })
        .from(rounds)
        .where(inArray(rounds.id, roundIds));

      const courseIds = roundRows
        .map((r) => r.courseId)
        .filter((id): id is string => Boolean(id));
      const courseMetaMap = new Map<string, Record<string, unknown> | null>();
      if (courseIds.length > 0) {
        const courseRows = await db
          .select({ id: courses.id, metadata: courses.metadata })
          .from(courses)
          .where(inArray(courses.id, courseIds));
        for (const c of courseRows) {
          courseMetaMap.set(c.id, c.metadata as Record<string, unknown> | null);
        }
      }

      for (const r of roundRows) {
        roundMap.set(r.id, {
          mode: r.mode,
          courseName: r.courseName,
          teeTime: r.teeTime,
          targetDate: r.targetDate,
          inviteToken: r.inviteToken,
          customImageUrl: r.customImageUrl,
          courseMetadata: r.courseId ? (courseMetaMap.get(r.courseId) ?? null) : null,
        });
      }
    }

    const participantRows = await db
      .select({
        conversationId: conversationParticipants.conversationId,
        userId: users.id,
        name: users.name,
        avatar: users.avatar,
      })
      .from(conversationParticipants)
      .innerJoin(users, eq(users.id, conversationParticipants.userId))
      .where(inArray(conversationParticipants.conversationId, convIds));

    const participantsByConv = new Map<
      string,
      Array<{ userId: string; name: string; avatar: string | null }>
    >();
    for (const p of participantRows) {
      const list = participantsByConv.get(p.conversationId) ?? [];
      list.push({ userId: p.userId, name: p.name, avatar: p.avatar });
      participantsByConv.set(p.conversationId, list);
    }

    const receiptRows = await db
      .select({
        conversationId: conversationReadReceipts.conversationId,
        lastReadAt: conversationReadReceipts.lastReadAt,
      })
      .from(conversationReadReceipts)
      .where(
        and(
          eq(conversationReadReceipts.userId, viewer.id),
          inArray(conversationReadReceipts.conversationId, convIds),
        ),
      );
    const readMap = new Map<string, Date>();
    for (const r of receiptRows) {
      readMap.set(r.conversationId, r.lastReadAt);
    }

    const result = rows.map((r) => {
      const participants = participantsByConv.get(r.conversationId) ?? [];
      const otherParticipants = participants.filter((p) => p.userId !== viewer.id);
      const lastRead = readMap.get(r.conversationId);
      const lastMsgIsMine = r.lastMsgSenderId === viewer.id;
      const isUnread =
        !lastMsgIsMine &&
        (!lastRead || new Date(r.lastMessageAt).getTime() > lastRead.getTime());

      let title: string;
      let imageUrl: string | null = null;
      const avatars = otherParticipants
        .map((p) => p.avatar)
        .filter((a): a is string => Boolean(a))
        .slice(0, 4);

      let roundMode: string | null = null;
      let roundInviteToken: string | null = null;

      if (r.type === "dm") {
        const other = otherParticipants[0];
        title = other?.name ?? "Chat";
        imageUrl = other?.avatar ?? null;
      } else if (r.type === "round" && r.roundId) {
        const ri = roundMap.get(r.roundId);
        if (ri) {
          roundMode = ri.mode;
          roundInviteToken = ri.inviteToken;
          if (ri.mode === "scheduled") {
            const datePart = ri.teeTime
              ? new Date(ri.teeTime).toLocaleDateString("en-US", { month: "short", day: "numeric" })
              : new Date(ri.targetDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
            title = ri.courseName
              ? `${ri.courseName} · ${datePart}`
              : datePart;
            imageUrl = resolveRoundImageUrl({
              customImageUrl: ri.customImageUrl,
              courseMetadata: ri.courseMetadata,
            });
          } else {
            title = new Date(ri.targetDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
            imageUrl = null;
          }
        } else {
          title = "Group Chat";
        }
      } else if (r.type === "group" && r.groupId) {
        title = groupNameMap.get(r.groupId) ?? "Group Chat";
        imageUrl = groupImageMap.get(r.groupId) ?? null;
      } else {
        title = "Group Chat";
      }

      return {
        id: r.conversationId,
        type: r.type,
        roundId: r.roundId,
        groupId: r.groupId,
        title,
        imageUrl,
        participantAvatars: avatars,
        isUnread,
        roundMode,
        roundInviteToken,
        lastMessage: {
          body: r.lastMsgBody,
          senderName: r.lastMsgSenderName,
          senderId: r.lastMsgSenderId,
          createdAt: new Date(r.lastMessageAt).toISOString(),
        },
        participantCount: participants.length,
      };
    });

    return NextResponse.json({ conversations: result });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[GET /api/conversations]", error);
    return NextResponse.json({ error: "Unable to load conversations." }, { status: 500 });
  }
}

const createSchema = z.object({
  participantUserId: z.string().uuid(),
});

export async function POST(req: Request) {
  try {
    const viewer = await requireDbUser(req);
    const body = await req.json();
    const { participantUserId } = createSchema.parse(body);

    if (participantUserId === viewer.id) {
      return NextResponse.json(
        { error: "Cannot create a conversation with yourself." },
        { status: 400 },
      );
    }

    const [otherUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, participantUserId))
      .limit(1);

    if (!otherUser) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const existing = await db
      .select({ conversationId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .innerJoin(
        conversations,
        and(
          eq(conversations.id, conversationParticipants.conversationId),
          eq(conversations.type, "dm"),
        ),
      )
      .where(eq(conversationParticipants.userId, viewer.id));

    if (existing.length > 0) {
      const existingConvIds = existing.map((e) => e.conversationId);
      const otherInSame = await db
        .select({ conversationId: conversationParticipants.conversationId })
        .from(conversationParticipants)
        .where(
          and(
            inArray(conversationParticipants.conversationId, existingConvIds),
            eq(conversationParticipants.userId, participantUserId),
          ),
        )
        .limit(1);

      if (otherInSame.length > 0) {
        return NextResponse.json({ conversationId: otherInSame[0].conversationId, existing: true });
      }
    }

    const [newConv] = await db
      .insert(conversations)
      .values({ type: "dm" })
      .returning({ id: conversations.id });

    await db.insert(conversationParticipants).values([
      { conversationId: newConv.id, userId: viewer.id },
      { conversationId: newConv.id, userId: participantUserId },
    ]);

    return NextResponse.json({ conversationId: newConv.id, existing: false });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST /api/conversations]", error);
    return NextResponse.json({ error: "Unable to create conversation." }, { status: 500 });
  }
}
