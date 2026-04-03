import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
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
import { isConversationParticipant } from "@/lib/conversation-access";
import { resolveRoundImageUrl } from "@/lib/round-images";

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const viewer = await requireDbUser(req);
    const conversationId = params.id;

    const [conv] = await db
      .select({
        id: conversations.id,
        type: conversations.type,
        roundId: conversations.roundId,
        groupId: conversations.groupId,
      })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (!conv) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const [membership] = await db
      .select({ conversationId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, viewer.id),
        ),
      )
      .limit(1);

    if (!membership) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const participantRows = await db
      .select({
        userId: users.id,
        name: users.name,
        avatar: users.avatar,
      })
      .from(conversationParticipants)
      .innerJoin(users, eq(users.id, conversationParticipants.userId))
      .where(eq(conversationParticipants.conversationId, conversationId));

    const otherParticipants = participantRows.filter(
      (p) => p.userId !== viewer.id,
    );

    const receiptRows = await db
      .select({
        userId: conversationReadReceipts.userId,
        lastReadMessageId: conversationReadReceipts.lastReadMessageId,
        lastReadMessageCreatedAt: messages.createdAt,
      })
      .from(conversationReadReceipts)
      .leftJoin(messages, eq(messages.id, conversationReadReceipts.lastReadMessageId))
      .where(eq(conversationReadReceipts.conversationId, conversationId));

    const receiptByUser = new Map(
      receiptRows.map((r) => [
        r.userId,
        {
          lastReadMessageId: r.lastReadMessageId,
          lastReadMessageCreatedAt: r.lastReadMessageCreatedAt
            ? r.lastReadMessageCreatedAt.toISOString()
            : null,
        },
      ]),
    );

    const participantReadReceipts = otherParticipants.map((p) => {
      const r = receiptByUser.get(p.userId);
      return {
        userId: p.userId,
        avatar: p.avatar,
        lastReadMessageId: r?.lastReadMessageId ?? null,
        lastReadMessageCreatedAt: r?.lastReadMessageCreatedAt ?? null,
      };
    });

    let title: string;
    let imageUrl: string | null = null;
    let roundMode: string | null = null;
    let roundDetails: {
      courseName: string | null;
      teeTime: string | null;
      targetDate: string;
      status: string;
    } | null = null;
    const participantAvatars = otherParticipants
      .map((p) => p.avatar)
      .filter((a): a is string => Boolean(a))
      .slice(0, 4);
    const participantNames = otherParticipants.map((p) => p.name);

    if (conv.type === "dm") {
      const other = otherParticipants[0];
      title = other?.name ?? "Chat";
      imageUrl = other?.avatar ?? null;
    } else if (conv.type === "round" && conv.roundId) {
      const [roundRow] = await db
        .select({
          id: rounds.id,
          mode: rounds.mode,
          courseName: rounds.courseName,
          teeTime: rounds.teeTime,
          targetDate: rounds.targetDate,
          customImageUrl: rounds.customImageUrl,
          courseId: rounds.courseId,
          status: rounds.status,
        })
        .from(rounds)
        .where(eq(rounds.id, conv.roundId))
        .limit(1);

      if (roundRow) {
        roundMode = roundRow.mode;
        roundDetails = {
          courseName: roundRow.courseName,
          teeTime: roundRow.teeTime ? roundRow.teeTime.toISOString() : null,
          targetDate: roundRow.targetDate.toISOString(),
          status: roundRow.status,
        };

        let courseMetadata: Record<string, unknown> | null = null;
        if (roundRow.courseId) {
          const [course] = await db
            .select({ metadata: courses.metadata })
            .from(courses)
            .where(eq(courses.id, roundRow.courseId))
            .limit(1);
          courseMetadata = (course?.metadata as Record<string, unknown>) ?? null;
        }

        if (roundRow.mode === "scheduled") {
          const datePart = roundRow.teeTime
            ? new Date(roundRow.teeTime).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })
            : new Date(roundRow.targetDate).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              });
          title = roundRow.courseName
            ? `${roundRow.courseName} · ${datePart}`
            : datePart;
          imageUrl = resolveRoundImageUrl({
            customImageUrl: roundRow.customImageUrl,
            courseMetadata,
          });
        } else {
          title = new Date(roundRow.targetDate).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });
          imageUrl = null;
        }
      } else {
        title = "Group Chat";
      }
    } else if (conv.type === "group" && conv.groupId) {
      const [group] = await db
        .select({ name: groups.name, imageUrl: groups.imageUrl })
        .from(groups)
        .where(eq(groups.id, conv.groupId))
        .limit(1);
      title = group?.name ?? "Group Chat";
      imageUrl = group?.imageUrl ?? null;
    } else {
      title = "Group Chat";
    }

    return NextResponse.json({
      id: conv.id,
      type: conv.type,
      title,
      imageUrl,
      roundMode,
      participantAvatars,
      participantNames,
      participantCount: participantRows.length,
      participants: participantRows.map((p) => ({
        id: p.userId,
        name: p.name,
        avatar: p.avatar,
      })),
      participantReadReceipts,
      roundDetails,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[GET /api/conversations/[id]]", error);
    return NextResponse.json(
      { error: "Unable to load conversation." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const viewer = await requireDbUser(req);
    const conversationId = params.id;

    if (!(await isConversationParticipant(conversationId, viewer.id))) {
      return NextResponse.json({ error: "Not a participant." }, { status: 403 });
    }

    await db
      .delete(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, viewer.id),
        ),
      );

    await db
      .delete(conversationReadReceipts)
      .where(
        and(
          eq(conversationReadReceipts.conversationId, conversationId),
          eq(conversationReadReceipts.userId, viewer.id),
        ),
      );

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[DELETE /api/conversations/[id]]", error);
    return NextResponse.json(
      { error: "Unable to leave conversation." },
      { status: 500 },
    );
  }
}
