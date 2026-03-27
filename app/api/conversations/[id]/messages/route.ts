import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDbUser } from "@/lib/auth";
import { isConversationParticipant, isDmBlocked } from "@/lib/conversation-access";
import {
  getConversationMessages,
  messagePostSchema,
  sendConversationMessage,
} from "@/lib/conversation-message-helpers";

type RouteContext = { params: { id: string } };

export async function GET(req: Request, { params }: RouteContext) {
  try {
    const viewer = await requireDbUser(req);
    const conversationId = params.id;

    if (!(await isConversationParticipant(conversationId, viewer.id))) {
      return NextResponse.json({ error: "Not a participant." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const before = searchParams.get("before") ?? undefined;
    const after = searchParams.get("after") ?? undefined;
    const limitRaw = Number(searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(limitRaw) ? limitRaw : undefined;

    const result = await getConversationMessages(conversationId, viewer.id, { before, after, limit });
    return NextResponse.json({ ...result, viewerId: viewer.id });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[GET /api/conversations/:id/messages]", error);
    return NextResponse.json({ error: "Unable to load messages." }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const viewer = await requireDbUser(req);
    const conversationId = params.id;

    if (!(await isConversationParticipant(conversationId, viewer.id))) {
      return NextResponse.json({ error: "Not a participant." }, { status: 403 });
    }

    if (await isDmBlocked(conversationId, viewer.id)) {
      return NextResponse.json({ error: "You cannot send messages in this conversation." }, { status: 403 });
    }

    const parsed = messagePostSchema.parse(await req.json());
    const attachments = parsed.attachments?.length ? parsed.attachments : null;
    const body = parsed.body?.length ? parsed.body : null;

    const message = await sendConversationMessage({
      conversationId,
      viewerId: viewer.id,
      viewerName: viewer.name,
      viewerAvatar: viewer.avatar,
      body,
      parentId: parsed.parentId ?? null,
      attachments,
    });

    return NextResponse.json({ message });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST /api/conversations/:id/messages]", error);
    return NextResponse.json({ error: "Unable to send message." }, { status: 500 });
  }
}
