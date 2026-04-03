import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDbUser } from "@/lib/auth";
import { isConversationParticipant } from "@/lib/conversation-access";
import { markConversationRead } from "@/lib/conversation-read-receipt";

type RouteContext = { params: { id: string } };

const readBodySchema = z.object({
  lastMessageId: z.string().uuid().optional(),
});

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const viewer = await requireDbUser(req);
    const conversationId = params.id;

    if (!(await isConversationParticipant(conversationId, viewer.id))) {
      return NextResponse.json({ error: "Not a participant." }, { status: 403 });
    }

    let lastMessageId: string | undefined;
    try {
      const raw = await req.json();
      const parsed = readBodySchema.safeParse(raw);
      if (parsed.success) {
        lastMessageId = parsed.data.lastMessageId;
      }
    } catch {
      /* empty body */
    }

    try {
      await markConversationRead(viewer.id, conversationId, { lastMessageId });
    } catch (e) {
      if (e instanceof Error && e.message === "INVALID_LAST_MESSAGE") {
        return NextResponse.json({ error: "Invalid message." }, { status: 400 });
      }
      throw e;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST /api/conversations/:id/read]", error);
    return NextResponse.json({ error: "Unable to mark as read." }, { status: 500 });
  }
}
