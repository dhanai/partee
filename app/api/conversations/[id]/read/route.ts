import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversationParticipants, conversationReadReceipts } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";

type RouteContext = { params: { id: string } };

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const viewer = await requireDbUser(req);
    const conversationId = params.id;

    const [row] = await db
      .select({ id: conversationParticipants.id })
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, viewer.id),
        ),
      )
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Not a participant." }, { status: 403 });
    }

    await db
      .insert(conversationReadReceipts)
      .values({
        userId: viewer.id,
        conversationId,
        lastReadAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [conversationReadReceipts.userId, conversationReadReceipts.conversationId],
        set: { lastReadAt: new Date() },
      });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST /api/conversations/:id/read]", error);
    return NextResponse.json({ error: "Unable to mark as read." }, { status: 500 });
  }
}
