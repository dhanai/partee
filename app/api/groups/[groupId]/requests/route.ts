import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  conversationParticipants,
  conversations,
  groupJoinRequests,
  groupMembers,
  users,
} from "@/db/schema";
import { requireDbUser } from "@/lib/auth";

type Ctx = { params: { groupId: string } };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const viewer = await requireDbUser(req);
    const { groupId } = params;

    const [membership] = await db
      .select({ role: groupMembers.role })
      .from(groupMembers)
      .where(
        and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, viewer.id)),
      )
      .limit(1);

    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const rows = await db
      .select({
        id: groupJoinRequests.id,
        userId: groupJoinRequests.userId,
        status: groupJoinRequests.status,
        createdAt: groupJoinRequests.createdAt,
        name: users.name,
        avatar: users.avatar,
      })
      .from(groupJoinRequests)
      .innerJoin(users, eq(users.id, groupJoinRequests.userId))
      .where(
        and(
          eq(groupJoinRequests.groupId, groupId),
          eq(groupJoinRequests.status, "pending"),
        ),
      )
      .orderBy(groupJoinRequests.createdAt);

    return NextResponse.json({
      requests: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        name: r.name,
        avatar: r.avatar,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[GET /api/groups/[groupId]/requests]", error);
    return NextResponse.json({ error: "Unable to load requests." }, { status: 500 });
  }
}

const decisionSchema = z.object({
  requestId: z.string().uuid(),
  action: z.enum(["accept", "decline"]),
});

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const viewer = await requireDbUser(req);
    const { groupId } = params;

    const [membership] = await db
      .select({ role: groupMembers.role })
      .from(groupMembers)
      .where(
        and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, viewer.id)),
      )
      .limit(1);

    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = await req.json();
    const { requestId, action } = decisionSchema.parse(body);

    const [request] = await db
      .select()
      .from(groupJoinRequests)
      .where(
        and(
          eq(groupJoinRequests.id, requestId),
          eq(groupJoinRequests.groupId, groupId),
        ),
      )
      .limit(1);

    if (!request || request.status !== "pending") {
      return NextResponse.json({ error: "Request not found or already handled." }, { status: 404 });
    }

    if (action === "accept") {
      await db
        .update(groupJoinRequests)
        .set({ status: "accepted" })
        .where(eq(groupJoinRequests.id, requestId));

      await db
        .insert(groupMembers)
        .values({ groupId, userId: request.userId, role: "member" })
        .onConflictDoNothing();

      const [conv] = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(
          and(eq(conversations.type, "group"), eq(conversations.groupId, groupId)),
        )
        .limit(1);

      if (conv) {
        await db
          .insert(conversationParticipants)
          .values({ conversationId: conv.id, userId: request.userId })
          .onConflictDoNothing();
      }
    } else {
      await db
        .update(groupJoinRequests)
        .set({ status: "declined" })
        .where(eq(groupJoinRequests.id, requestId));
    }

    return NextResponse.json({ ok: true, action });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[PATCH /api/groups/[groupId]/requests]", error);
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
