import { NextResponse } from "next/server";
import { requireDbUser } from "@/lib/auth";
import { isConversationParticipant } from "@/lib/conversation-access";
import { addReaction, removeReaction } from "@/lib/conversation-reaction-helpers";

type RouteContext = { params: { id: string; messageId: string } };

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const viewer = await requireDbUser(req);
    const { id: conversationId, messageId } = params;

    if (!(await isConversationParticipant(conversationId, viewer.id))) {
      return NextResponse.json({ error: "Not a participant." }, { status: 403 });
    }

    const result = await addReaction({
      conversationId,
      messageId,
      userId: viewer.id,
      rawBody: await req.json(),
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result);
  } catch (error) {
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

    if (!(await isConversationParticipant(conversationId, viewer.id))) {
      return NextResponse.json({ error: "Not a participant." }, { status: 403 });
    }

    const emoji = new URL(req.url).searchParams.get("emoji");
    const result = await removeReaction({ conversationId, messageId, userId: viewer.id, emoji });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[DELETE reactions]", error);
    return NextResponse.json({ error: "Unable to remove reaction." }, { status: 500 });
  }
}
