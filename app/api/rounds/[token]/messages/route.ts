import { and, asc, desc, eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { roundMessages, rounds, users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { notifyRoundChatMessagePushes } from "@/lib/notify-user";
import { publishAfterRoundDetailChanged } from "@/lib/parfade-ably-publish";
import { canAccessRoundChat } from "@/lib/round-chat-access";

type RouteContext = {
  params: { token: string };
};

const MAX_BODY = 2000;
const MAX_LIMIT = 50;

const postSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Message cannot be empty.")
    .max(MAX_BODY, `Message must be ${MAX_BODY} characters or fewer.`),
});

function mapMessageRow(
  r: {
    id: string;
    body: string;
    createdAt: Date;
    userId: string;
    userName: string;
    userAvatar: string | null;
  },
  viewerId: string,
) {
  return {
    id: r.id,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
    isMine: r.userId === viewerId,
    user: {
      id: r.userId,
      name: r.userName,
      avatar: r.userAvatar,
    },
  };
}

export async function GET(req: Request, { params }: RouteContext) {
  try {
    const viewer = await requireDbUser(req);
    const token = params.token;
    if (!token) {
      return NextResponse.json({ error: "Token is required." }, { status: 400 });
    }

    const [round] = await db
      .select({ id: rounds.id })
      .from(rounds)
      .where(eq(rounds.inviteToken, token))
      .limit(1);

    if (!round) {
      return NextResponse.json({ error: "Round not found." }, { status: 404 });
    }

    const allowed = await canAccessRoundChat(round.id, viewer.id);
    if (!allowed) {
      return NextResponse.json({ error: "You do not have access to this chat." }, { status: 403 });
    }

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
        .select({ createdAt: roundMessages.createdAt })
        .from(roundMessages)
        .where(
          and(
            eq(roundMessages.id, uuidParse.data),
            eq(roundMessages.roundId, round.id),
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
          id: roundMessages.id,
          body: roundMessages.body,
          createdAt: roundMessages.createdAt,
          userId: roundMessages.userId,
          userName: users.name,
          userAvatar: users.avatar,
        })
        .from(roundMessages)
        .innerJoin(users, eq(users.id, roundMessages.userId))
        .where(and(eq(roundMessages.roundId, round.id), gt(roundMessages.createdAt, ref.createdAt)))
        .orderBy(asc(roundMessages.createdAt))
        .limit(limit);

      return NextResponse.json({
        messages: rows.map((row) => mapMessageRow(row, viewer.id)),
        viewerId: viewer.id,
      });
    }

    const rowsDesc = await db
      .select({
        id: roundMessages.id,
        body: roundMessages.body,
        createdAt: roundMessages.createdAt,
        userId: roundMessages.userId,
        userName: users.name,
        userAvatar: users.avatar,
      })
      .from(roundMessages)
      .innerJoin(users, eq(users.id, roundMessages.userId))
      .where(eq(roundMessages.roundId, round.id))
      .orderBy(desc(roundMessages.createdAt))
      .limit(limit);

    const chronological = [...rowsDesc].reverse();
    return NextResponse.json({
      messages: chronological.map((row) => mapMessageRow(row, viewer.id)),
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

    if (!round) {
      return NextResponse.json({ error: "Round not found." }, { status: 404 });
    }

    const allowed = await canAccessRoundChat(round.id, viewer.id);
    if (!allowed) {
      return NextResponse.json({ error: "You do not have access to this chat." }, { status: 403 });
    }

    const parsed = postSchema.parse(await req.json());

    const [inserted] = await db
      .insert(roundMessages)
      .values({
        roundId: round.id,
        userId: viewer.id,
        body: parsed.body,
      })
      .returning({
        id: roundMessages.id,
        body: roundMessages.body,
        createdAt: roundMessages.createdAt,
        userId: roundMessages.userId,
      });

    if (!inserted) {
      return NextResponse.json({ error: "Failed to send message." }, { status: 500 });
    }

    void notifyRoundChatMessagePushes({
      roundId: round.id,
      inviteToken: round.inviteToken,
      senderUserId: viewer.id,
      senderName: viewer.name,
      messageBody: parsed.body,
      courseName: round.courseName,
      planningLocation: round.planningLocation,
      mode: round.mode,
      teeTime: round.teeTime,
      targetDate: round.targetDate,
    }).catch((err) => console.error("[POST /api/rounds/.../messages] push", err));

    publishAfterRoundDetailChanged(token, "chat-message");

    return NextResponse.json({
      message: mapMessageRow(
        {
          id: inserted.id,
          body: inserted.body,
          createdAt: inserted.createdAt,
          userId: inserted.userId,
          userName: viewer.name,
          userAvatar: viewer.avatar,
        },
        viewer.id,
      ),
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
