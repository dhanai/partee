import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversationReadReceipts, conversations, rounds } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const user = await requireDbUser(req);
    const body = (await req.json()) as { inviteToken?: string };
    const { inviteToken } = body;

    if (!inviteToken || typeof inviteToken !== "string") {
      return NextResponse.json(
        { error: "inviteToken is required" },
        { status: 400 },
      );
    }

    const [round] = await db
      .select({ id: rounds.id })
      .from(rounds)
      .where(eq(rounds.inviteToken, inviteToken))
      .limit(1);

    if (!round) {
      return NextResponse.json({ error: "Round not found" }, { status: 404 });
    }

    const [conv] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.roundId, round.id), eq(conversations.type, "round")))
      .limit(1);

    if (!conv) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const now = new Date();
    await db
      .insert(conversationReadReceipts)
      .values({ userId: user.id, conversationId: conv.id, lastReadAt: now })
      .onConflictDoUpdate({
        target: [conversationReadReceipts.userId, conversationReadReceipts.conversationId],
        set: { lastReadAt: now },
      });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(error);
    return NextResponse.json(
      { error: "Unable to mark chat as read." },
      { status: 500 },
    );
  }
}
