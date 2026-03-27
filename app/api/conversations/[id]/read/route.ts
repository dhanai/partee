import { NextResponse } from "next/server";
import { requireDbUser } from "@/lib/auth";
import { isConversationParticipant } from "@/lib/conversation-access";
import { markConversationRead } from "@/lib/conversation-read-receipt";

type RouteContext = { params: { id: string } };

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const viewer = await requireDbUser(req);
    const conversationId = params.id;

    if (!(await isConversationParticipant(conversationId, viewer.id))) {
      return NextResponse.json({ error: "Not a participant." }, { status: 403 });
    }

    await markConversationRead(viewer.id, conversationId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST /api/conversations/:id/read]", error);
    return NextResponse.json({ error: "Unable to mark as read." }, { status: 500 });
  }
}
