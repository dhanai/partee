import { NextResponse } from "next/server";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  conversationParticipants,
  messages,
  messageReactions,
  users,
} from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { publishConversationMessage } from "@/lib/conversation-ably";

type RouteContext = { params: { id: string } };

const MAX_BODY = 2000;
const PAGE_SIZE = 50;

async function isParticipant(conversationId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: conversationParticipants.id })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function GET(req: Request, { params }: RouteContext) {
  try {
    const viewer = await requireDbUser(req);
    const conversationId = params.id;

    if (!(await isParticipant(conversationId, viewer.id))) {
      return NextResponse.json({ error: "Not a participant." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const before = searchParams.get("before");
    const limitRaw = Number(searchParams.get("limit") ?? PAGE_SIZE);
    const limit = Math.max(1, Math.min(PAGE_SIZE, Math.trunc(limitRaw)));

    let whereClause = eq(messages.conversationId, conversationId);

    if (before) {
      const parsed = z.string().uuid().safeParse(before);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid before cursor." }, { status: 400 });
      }

      const [ref] = await db
        .select({ createdAt: messages.createdAt })
        .from(messages)
        .where(and(eq(messages.id, parsed.data), eq(messages.conversationId, conversationId)))
        .limit(1);

      if (!ref) {
        return NextResponse.json({ messages: [], hasMore: false });
      }

      whereClause = and(
        eq(messages.conversationId, conversationId),
        lt(messages.createdAt, ref.createdAt),
      )!;
    }

    const rowsDesc = await db
      .select({
        id: messages.id,
        body: messages.body,
        parentId: messages.parentId,
        createdAt: messages.createdAt,
        userId: messages.userId,
        userName: users.name,
        userAvatar: users.avatar,
      })
      .from(messages)
      .innerJoin(users, eq(users.id, messages.userId))
      .where(whereClause)
      .orderBy(desc(messages.createdAt))
      .limit(limit + 1);

    const hasMore = rowsDesc.length > limit;
    const page = hasMore ? rowsDesc.slice(0, limit) : rowsDesc;
    const chronological = [...page].reverse();

    const msgIds = chronological.map((m) => m.id);
    const reactionRows =
      msgIds.length > 0
        ? await db
            .select({
              messageId: messageReactions.messageId,
              emoji: messageReactions.emoji,
              userId: messageReactions.userId,
            })
            .from(messageReactions)
            .where(sql`${messageReactions.messageId} IN (${sql.join(msgIds.map((id) => sql`${id}`), sql`, `)})`)
        : [];

    const reactionsByMsg = new Map<
      string,
      Array<{ emoji: string; userId: string }>
    >();
    for (const r of reactionRows) {
      const list = reactionsByMsg.get(r.messageId) ?? [];
      list.push({ emoji: r.emoji, userId: r.userId });
      reactionsByMsg.set(r.messageId, list);
    }

    let parentMap = new Map<string, { body: string; userName: string }>();
    const parentIds = [
      ...new Set(chronological.map((m) => m.parentId).filter((p): p is string => Boolean(p))),
    ];
    if (parentIds.length > 0) {
      const parentRows = await db
        .select({
          id: messages.id,
          body: messages.body,
          userName: users.name,
        })
        .from(messages)
        .innerJoin(users, eq(users.id, messages.userId))
        .where(sql`${messages.id} IN (${sql.join(parentIds.map((id) => sql`${id}`), sql`, `)})`);
      parentMap = new Map(parentRows.map((p) => [p.id, { body: p.body, userName: p.userName }]));
    }

    const mapped = chronological.map((m) => {
      const reactions = reactionsByMsg.get(m.id) ?? [];
      const grouped: Record<string, { count: number; userIds: string[] }> = {};
      for (const r of reactions) {
        if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, userIds: [] };
        grouped[r.emoji].count++;
        grouped[r.emoji].userIds.push(r.userId);
      }

      const parent = m.parentId ? parentMap.get(m.parentId) : null;

      return {
        id: m.id,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
        isMine: m.userId === viewer.id,
        parentId: m.parentId,
        parentPreview: parent
          ? { body: parent.body.length > 80 ? parent.body.slice(0, 77) + "…" : parent.body, senderName: parent.userName }
          : null,
        user: { id: m.userId, name: m.userName, avatar: m.userAvatar },
        reactions: grouped,
      };
    });

    return NextResponse.json({ messages: mapped, hasMore, viewerId: viewer.id });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[GET /api/conversations/:id/messages]", error);
    return NextResponse.json({ error: "Unable to load messages." }, { status: 500 });
  }
}

const postSchema = z.object({
  body: z.string().trim().min(1).max(MAX_BODY),
  parentId: z.string().uuid().optional(),
});

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const viewer = await requireDbUser(req);
    const conversationId = params.id;

    if (!(await isParticipant(conversationId, viewer.id))) {
      return NextResponse.json({ error: "Not a participant." }, { status: 403 });
    }

    const parsed = postSchema.parse(await req.json());

    const [inserted] = await db
      .insert(messages)
      .values({
        conversationId,
        userId: viewer.id,
        body: parsed.body,
        parentId: parsed.parentId ?? null,
      })
      .returning();

    if (!inserted) {
      return NextResponse.json({ error: "Failed to send message." }, { status: 500 });
    }

    void publishConversationMessage({
      conversationId,
      messageId: inserted.id,
      senderId: viewer.id,
      senderName: viewer.name,
      body: parsed.body,
    }).catch((err) => console.error("[POST messages] ably publish", err));

    let parentPreview: { body: string; senderName: string } | null = null;
    if (inserted.parentId) {
      const [parent] = await db
        .select({ body: messages.body, userName: users.name })
        .from(messages)
        .innerJoin(users, eq(users.id, messages.userId))
        .where(eq(messages.id, inserted.parentId))
        .limit(1);
      if (parent) {
        parentPreview = {
          body: parent.body.length > 80 ? parent.body.slice(0, 77) + "…" : parent.body,
          senderName: parent.userName,
        };
      }
    }

    return NextResponse.json({
      message: {
        id: inserted.id,
        body: inserted.body,
        createdAt: inserted.createdAt.toISOString(),
        isMine: true,
        parentId: inserted.parentId,
        parentPreview,
        user: { id: viewer.id, name: viewer.name, avatar: viewer.avatar },
        reactions: {},
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST /api/conversations/:id/messages]", error);
    return NextResponse.json({ error: "Unable to send message." }, { status: 500 });
  }
}
