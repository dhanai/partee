import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  conversationParticipants,
  messages,
  messageReactions,
} from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { publishConversationReaction } from "@/lib/conversation-ably";

type RouteContext = { params: { id: string; messageId: string } };

const VALID_EMOJIS = ["heart", "laugh", "thumbs_up", "thumbs_down"] as const;

const postSchema = z.object({
  emoji: z.enum(VALID_EMOJIS),
});

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

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const viewer = await requireDbUser(req);
    const { id: conversationId, messageId } = params;

    if (!(await isParticipant(conversationId, viewer.id))) {
      return NextResponse.json({ error: "Not a participant." }, { status: 403 });
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
      .insert(messageReactions)
      .values({ messageId, userId: viewer.id, emoji })
      .onConflictDoNothing();

    void publishConversationReaction({
      conversationId,
      messageId,
      userId: viewer.id,
      emoji,
      action: "add",
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid emoji." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST reactions]", error);
    return NextResponse.json({ error: "Unable to add reaction." }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: RouteContext) {
  try {
    const viewer = await requireDbUser(req);
    const { id: conversationId, messageId } = params;

    if (!(await isParticipant(conversationId, viewer.id))) {
      return NextResponse.json({ error: "Not a participant." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const emoji = searchParams.get("emoji");

    if (!emoji || !VALID_EMOJIS.includes(emoji as any)) {
      return NextResponse.json({ error: "Invalid emoji." }, { status: 400 });
    }

    await db
      .delete(messageReactions)
      .where(
        and(
          eq(messageReactions.messageId, messageId),
          eq(messageReactions.userId, viewer.id),
          eq(messageReactions.emoji, emoji as any),
        ),
      );

    void publishConversationReaction({
      conversationId,
      messageId,
      userId: viewer.id,
      emoji,
      action: "remove",
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[DELETE reactions]", error);
    return NextResponse.json({ error: "Unable to remove reaction." }, { status: 500 });
  }
}
