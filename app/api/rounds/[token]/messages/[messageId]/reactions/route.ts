import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  conversationParticipants,
  conversations,
  messageReactions,
  messages,
  rounds,
} from "@/db/schema";
import { requireDbUser } from "@/lib/auth";

type RouteContext = { params: { token: string; messageId: string } };

const VALID_EMOJIS = ["heart", "laugh", "thumbs_up", "thumbs_down"] as const;

const postSchema = z.object({
  emoji: z.enum(VALID_EMOJIS),
});

async function canAccessChat(token: string, viewerId: string) {
  const [round] = await db
    .select({ id: rounds.id })
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

  return participant ? conv.id : null;
}

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const viewer = await requireDbUser(req);
    const { token, messageId } = params;

    const conversationId = await canAccessChat(token, viewer.id);
    if (!conversationId) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const [msg] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.conversationId, conversationId)))
      .limit(1);

    if (!msg) {
      return NextResponse.json({ error: "Message not found." }, { status: 404 });
    }

    const { emoji } = postSchema.parse(await req.json());

    await db
      .delete(messageReactions)
      .where(
        and(
          eq(messageReactions.messageId, messageId),
          eq(messageReactions.userId, viewer.id),
        ),
      );

    await db
      .insert(messageReactions)
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

    const conversationId = await canAccessChat(token, viewer.id);
    if (!conversationId) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const emoji = searchParams.get("emoji");

    if (!emoji || !(VALID_EMOJIS as readonly string[]).includes(emoji)) {
      return NextResponse.json({ error: "Invalid emoji." }, { status: 400 });
    }

    await db
      .delete(messageReactions)
      .where(
        and(
          eq(messageReactions.messageId, messageId),
          eq(messageReactions.userId, viewer.id),
          eq(messageReactions.emoji, emoji as typeof VALID_EMOJIS[number]),
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
