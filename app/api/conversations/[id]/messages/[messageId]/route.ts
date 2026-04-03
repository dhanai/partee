import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDbUser } from "@/lib/auth";
import { isConversationParticipant } from "@/lib/conversation-access";
import {
  editConversationMessage,
  messagePatchSchema,
  unsendConversationMessage,
} from "@/lib/conversation-message-helpers";

type RouteContext = { params: { id: string; messageId: string } };

function mapMutateError(message: string): { status: number; body: string } {
  switch (message) {
    case "NOT_FOUND":
      return { status: 404, body: "Message not found." };
    case "FORBIDDEN":
      return { status: 403, body: "You cannot change this message." };
    case "DELETED":
      return { status: 400, body: "This message was removed." };
    case "EDIT_EXPIRED":
      return { status: 400, body: "This message can no longer be edited." };
    case "ALREADY_DELETED":
      return { status: 400, body: "This message was already removed." };
    default:
      return { status: 500, body: "Unable to update message." };
  }
}

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const viewer = await requireDbUser(req);
    const { id: conversationId, messageId } = params;

    if (!(await isConversationParticipant(conversationId, viewer.id))) {
      return NextResponse.json({ error: "Not a participant." }, { status: 403 });
    }

    const parsed = messagePatchSchema.parse(await req.json());
    try {
      const message = await editConversationMessage({
        conversationId,
        messageId,
        viewerId: viewer.id,
        body: parsed.body,
      });
      return NextResponse.json({ message });
    } catch (e) {
      if (e instanceof Error) {
        const m = mapMutateError(e.message);
        return NextResponse.json({ error: m.body }, { status: m.status });
      }
      throw e;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[PATCH conversation message]", error);
    return NextResponse.json({ error: "Unable to update message." }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: RouteContext) {
  try {
    const viewer = await requireDbUser(req);
    const { id: conversationId, messageId } = params;

    if (!(await isConversationParticipant(conversationId, viewer.id))) {
      return NextResponse.json({ error: "Not a participant." }, { status: 403 });
    }

    try {
      await unsendConversationMessage({
        conversationId,
        messageId,
        viewerId: viewer.id,
      });
      return NextResponse.json({ ok: true });
    } catch (e) {
      if (e instanceof Error) {
        const m = mapMutateError(e.message);
        return NextResponse.json({ error: m.body }, { status: m.status });
      }
      throw e;
    }
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[DELETE conversation message]", error);
    return NextResponse.json({ error: "Unable to remove message." }, { status: 500 });
  }
}
