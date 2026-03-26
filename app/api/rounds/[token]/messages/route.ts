import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import {
  conversationParticipants,
  conversations,
  messageReactions,
  messages,
  rounds,
  users,
} from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { type MessageAttachment, getImageUrls } from "@/lib/attachment-types";
import { notifyRoundChatMessagePushes } from "@/lib/notify-user";
import {
  publishAfterRoundDetailChanged,
  publishGroupChatToastFanout,
} from "@/lib/parfade-ably-publish";

type RouteContext = {
  params: { token: string };
};

const MAX_BODY = 2000;
const MAX_LIMIT = 50;

const attachmentSchema = z.object({
  type: z.literal("image"),
  url: z.string().url(),
});

const postSchema = z
  .object({
    body: z.string().trim().max(MAX_BODY, `Message must be ${MAX_BODY} characters or fewer.`).optional(),
    parentId: z.string().uuid().optional(),
    attachments: z.array(attachmentSchema).max(5).optional(),
  })
  .refine((d) => (d.body && d.body.length > 0) || (d.attachments && d.attachments.length > 0), {
    message: "Message must have text or at least one attachment.",
  });

type MappedMessage = {
  id: string;
  body: string | null;
  attachments?: MessageAttachment[] | null;
  createdAt: string;
  isMine: boolean;
  parentId?: string | null;
  parentPreview?: { body: string; senderName: string } | null;
  user: { id: string; name: string; avatar: string | null };
  reactions?: Record<string, { count: number; userIds: string[] }>;
};

function mapMessageRow(
  r: {
    id: string;
    body: string | null;
    createdAt: Date;
    userId: string;
    userName: string;
    userAvatar: string | null;
    parentId?: string | null;
    attachments?: unknown;
  },
  viewerId: string,
): MappedMessage {
  return {
    id: r.id,
    body: r.body,
    attachments: (r.attachments as MessageAttachment[] | null) ?? null,
    createdAt: r.createdAt.toISOString(),
    isMine: r.userId === viewerId,
    parentId: r.parentId ?? null,
    user: {
      id: r.userId,
      name: r.userName,
      avatar: r.userAvatar,
    },
  };
}

async function attachReactions(msgs: MappedMessage[]): Promise<MappedMessage[]> {
  if (msgs.length === 0) return msgs;
  const ids = msgs.map((m) => m.id);
  const rows = await db
    .select({
      messageId: messageReactions.messageId,
      emoji: messageReactions.emoji,
      userId: messageReactions.userId,
    })
    .from(messageReactions)
    .where(inArray(messageReactions.messageId, ids));

  if (rows.length === 0) return msgs;

  const map = new Map<string, Record<string, { count: number; userIds: string[] }>>();
  for (const r of rows) {
    let byMsg = map.get(r.messageId);
    if (!byMsg) {
      byMsg = {};
      map.set(r.messageId, byMsg);
    }
    const entry = byMsg[r.emoji] ?? { count: 0, userIds: [] };
    entry.count += 1;
    entry.userIds.push(r.userId);
    byMsg[r.emoji] = entry;
  }

  return msgs.map((m) => {
    const reactions = map.get(m.id);
    return reactions ? { ...m, reactions } : m;
  });
}

async function attachParentPreviews(msgs: MappedMessage[]): Promise<MappedMessage[]> {
  const parentIds = [
    ...new Set(msgs.map((m) => m.parentId).filter((p): p is string => Boolean(p))),
  ];
  if (parentIds.length === 0) return msgs;

  const parentRows = await db
    .select({
      id: messages.id,
      body: messages.body,
      userName: users.name,
    })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.userId))
    .where(sql`${messages.id} IN (${sql.join(parentIds.map((id) => sql`${id}`), sql`, `)})`);

  const parentMap = new Map(
    parentRows.map((p) => [p.id, { body: p.body ?? "", userName: p.userName }]),
  );

  return msgs.map((m) => {
    if (!m.parentId) return m;
    const parent = parentMap.get(m.parentId);
    return {
      ...m,
      parentPreview: parent
        ? {
            body: parent.body.length > 80 ? parent.body.slice(0, 77) + "…" : parent.body,
            senderName: parent.userName,
          }
        : null,
    };
  });
}

async function resolveRoundConversation(token: string, viewerId: string) {
  const [round] = await db
    .select({
      id: rounds.id,
      inviteToken: rounds.inviteToken,
      courseName: rounds.courseName,
      planningLocation: rounds.planningLocation,
      mode: rounds.mode,
      teeTime: rounds.teeTime,
      targetDate: rounds.targetDate,
    })
    .from(rounds)
    .where(eq(rounds.inviteToken, token))
    .limit(1);

  if (!round) return null;

  const [conv] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.roundId, round.id), eq(conversations.type, "round")))
    .limit(1);

  if (!conv) return null;

  const [participant] = await db
    .select({ id: conversationParticipants.id })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conv.id),
        eq(conversationParticipants.userId, viewerId),
      ),
    )
    .limit(1);

  if (!participant) return null;

  return { round, conversationId: conv.id };
}

export async function GET(req: Request, { params }: RouteContext) {
  try {
    const viewer = await requireDbUser(req);
    const token = params.token;
    if (!token) {
      return NextResponse.json({ error: "Token is required." }, { status: 400 });
    }

    const resolved = await resolveRoundConversation(token, viewer.id);
    if (!resolved) {
      return NextResponse.json({ error: "You do not have access to this chat." }, { status: 403 });
    }
    const { conversationId } = resolved;

    const { searchParams } = new URL(req.url);
    const after = searchParams.get("after");
    const parsedLimit = Number(searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(MAX_LIMIT, Math.trunc(parsedLimit)))
      : 50;

    if (after) {
      const uuidParse = z.string().uuid().safeParse(after);
      if (!uuidParse.success) {
        return NextResponse.json({ error: "Invalid after cursor." }, { status: 400 });
      }

      const [ref] = await db
        .select({ createdAt: messages.createdAt })
        .from(messages)
        .where(
          and(
            eq(messages.id, uuidParse.data),
            eq(messages.conversationId, conversationId),
          ),
        )
        .limit(1);

      if (!ref) {
        return NextResponse.json({
          messages: [],
          viewerId: viewer.id,
        });
      }

      const rows = await db
        .select({
          id: messages.id,
          body: messages.body,
          parentId: messages.parentId,
          attachments: messages.attachments,
          createdAt: messages.createdAt,
          userId: messages.userId,
          userName: users.name,
          userAvatar: users.avatar,
        })
        .from(messages)
        .innerJoin(users, eq(users.id, messages.userId))
        .where(and(eq(messages.conversationId, conversationId), gt(messages.createdAt, ref.createdAt)))
        .orderBy(asc(messages.createdAt))
        .limit(limit);

      const mapped = rows.map((row) => mapMessageRow(row, viewer.id));
      return NextResponse.json({
        messages: await attachParentPreviews(await attachReactions(mapped)),
        viewerId: viewer.id,
      });
    }

    const rowsDesc = await db
      .select({
        id: messages.id,
        body: messages.body,
        parentId: messages.parentId,
        attachments: messages.attachments,
        createdAt: messages.createdAt,
        userId: messages.userId,
        userName: users.name,
        userAvatar: users.avatar,
      })
      .from(messages)
      .innerJoin(users, eq(users.id, messages.userId))
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    const chronological = [...rowsDesc].reverse();
    const mapped = chronological.map((row) => mapMessageRow(row, viewer.id));
    return NextResponse.json({
      messages: await attachParentPreviews(await attachReactions(mapped)),
      viewerId: viewer.id,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[GET /api/rounds/.../messages]", error);
    return NextResponse.json({ error: "Unable to load messages." }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const viewer = await requireDbUser(req);
    const token = params.token;
    if (!token) {
      return NextResponse.json({ error: "Token is required." }, { status: 400 });
    }

    const resolved = await resolveRoundConversation(token, viewer.id);
    if (!resolved) {
      return NextResponse.json({ error: "You do not have access to this chat." }, { status: 403 });
    }
    const { round, conversationId } = resolved;

    const parsed = postSchema.parse(await req.json());

    const attachments = parsed.attachments?.length ? parsed.attachments : null;
    const body = parsed.body?.length ? parsed.body : null;

    const [inserted] = await db
      .insert(messages)
      .values({
        conversationId,
        userId: viewer.id,
        body,
        parentId: parsed.parentId ?? null,
        attachments,
      })
      .returning({
        id: messages.id,
        body: messages.body,
        parentId: messages.parentId,
        attachments: messages.attachments,
        createdAt: messages.createdAt,
        userId: messages.userId,
      });

    if (!inserted) {
      return NextResponse.json({ error: "Failed to send message." }, { status: 500 });
    }

    const imageCount = getImageUrls(attachments).length;
    const pushBody = body
      ? body
      : imageCount === 1
        ? "Sent a photo"
        : imageCount > 1
          ? `Sent ${imageCount} photos`
          : "";

    void notifyRoundChatMessagePushes({
      roundId: round.id,
      inviteToken: round.inviteToken,
      senderUserId: viewer.id,
      senderName: viewer.name,
      messageBody: pushBody,
      courseName: round.courseName,
      planningLocation: round.planningLocation,
      mode: round.mode,
      teeTime: round.teeTime,
      targetDate: round.targetDate,
    }).catch((err) => console.error("[POST /api/rounds/.../messages] push", err));

    publishGroupChatToastFanout({
      roundId: round.id,
      inviteToken: round.inviteToken,
      senderUserId: viewer.id,
      senderName: viewer.name,
      senderAvatar: viewer.avatar,
      messageBody: pushBody,
      courseName: round.courseName,
      planningLocation: round.planningLocation,
      mode: round.mode,
      teeTime: round.teeTime,
      targetDate: round.targetDate,
    });

    publishAfterRoundDetailChanged(token, "chat-message");

    const mapped = mapMessageRow(
      {
        id: inserted.id,
        body: inserted.body,
        parentId: inserted.parentId,
        attachments: inserted.attachments,
        createdAt: inserted.createdAt,
        userId: inserted.userId,
        userName: viewer.name,
        userAvatar: viewer.avatar,
      },
      viewer.id,
    );
    const [withPreview] = await attachParentPreviews([mapped]);

    return NextResponse.json({
      message: withPreview,
      viewerId: viewer.id,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const first = error.issues[0];
      return NextResponse.json(
        { error: first?.message ?? "Invalid message." },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST /api/rounds/.../messages]", error);
    return NextResponse.json({ error: "Unable to send message." }, { status: 500 });
  }
}
