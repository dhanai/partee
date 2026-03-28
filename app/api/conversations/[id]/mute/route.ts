import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { conversationParticipants } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";

const muteSchema = z.object({ muted: z.boolean() });

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const viewer = await requireDbUser(req);
    const conversationId = params.id;
    const body = muteSchema.parse(await req.json());

    const [row] = await db
      .update(conversationParticipants)
      .set({ muted: body.muted })
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, viewer.id),
        ),
      )
      .returning({ muted: conversationParticipants.muted });

    if (!row) {
      return NextResponse.json({ error: "Not a participant." }, { status: 403 });
    }

    return NextResponse.json({ ok: true, muted: row.muted });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[PATCH /api/conversations/[id]/mute]", error);
    return NextResponse.json({ error: "Unable to update mute." }, { status: 500 });
  }
}
