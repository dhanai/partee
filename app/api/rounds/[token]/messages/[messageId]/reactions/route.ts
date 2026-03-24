import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { rounds, roundMessages, roundMessageReactions } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { canAccessRoundChat } from "@/lib/round-chat-access";

type RouteContext = { params: { token: string; messageId: string } };

const VALID_EMOJIS = ["heart", "laugh", "thumbs_up", "thumbs_down"] as const;

const postSchema = z.object({
  emoji: z.enum(VALID_EMOJIS),
});

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const viewer = await requireDbUser(req);
    const { token, messageId } = params;

    const [round] = await db
      .select({ id: rounds.id })
      .from(rounds)
      .where(eq(rounds.inviteToken, token))
      .limit(1);

    if (!round) {
      return NextResponse.json({ error: "Round not found." }, { status: 404 });
    }

    if (!(await canAccessRoundChat(round.id, viewer.id))) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const [msg] = await db
      .select({ id: roundMessages.id })
      .from(roundMessages)
      .where(and(eq(roundMessages.id, messageId), eq(roundMessages.roundId, round.id)))
      .limit(1);

    if (!msg) {
      return NextResponse.json({ error: "Message not found." }, { status: 404 });
    }

    const { emoji } = postSchema.parse(await req.json());

    await db
      .delete(roundMessageReactions)
      .where(
        and(
          eq(roundMessageReactions.messageId, messageId),
          eq(roundMessageReactions.userId, viewer.id),
        ),
      );

    await db
      .insert(roundMessageReactions)
      .values({ messageId, userId: viewer.id, emoji })
      .onConflictDoNothing();

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid emoji." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST round reactions]", error);
    return NextResponse.json({ error: "Unable to add reaction." }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: RouteContext) {
  try {
    const viewer = await requireDbUser(req);
    const { token, messageId } = params;

    const [round] = await db
      .select({ id: rounds.id })
      .from(rounds)
      .where(eq(rounds.inviteToken, token))
      .limit(1);

    if (!round) {
      return NextResponse.json({ error: "Round not found." }, { status: 404 });
    }

    if (!(await canAccessRoundChat(round.id, viewer.id))) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const emoji = searchParams.get("emoji");

    if (!emoji || !(VALID_EMOJIS as readonly string[]).includes(emoji)) {
      return NextResponse.json({ error: "Invalid emoji." }, { status: 400 });
    }

    await db
      .delete(roundMessageReactions)
      .where(
        and(
          eq(roundMessageReactions.messageId, messageId),
          eq(roundMessageReactions.userId, viewer.id),
          eq(roundMessageReactions.emoji, emoji as typeof VALID_EMOJIS[number]),
        ),
      );

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[DELETE round reactions]", error);
    return NextResponse.json({ error: "Unable to remove reaction." }, { status: 500 });
  }
}
