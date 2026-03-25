import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  conversationParticipants,
  conversations,
  groupMembers,
  users,
} from "@/db/schema";
import { requireDbUser } from "@/lib/auth";

type Ctx = { params: { groupId: string } };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const viewer = await requireDbUser(req);
    const { groupId } = params;

    const rows = await db
      .select({
        id: groupMembers.id,
        userId: groupMembers.userId,
        role: groupMembers.role,
        joinedAt: groupMembers.joinedAt,
        name: users.name,
        avatar: users.avatar,
      })
      .from(groupMembers)
      .innerJoin(users, eq(users.id, groupMembers.userId))
      .where(eq(groupMembers.groupId, groupId))
      .orderBy(groupMembers.joinedAt);

    const [viewerMembership] = await db
      .select({ role: groupMembers.role })
      .from(groupMembers)
      .where(
        and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, viewer.id)),
      )
      .limit(1);

    return NextResponse.json({
      members: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        name: r.name,
        avatar: r.avatar,
        role: r.role,
        joinedAt: r.joinedAt.toISOString(),
      })),
      viewerRole: viewerMembership?.role ?? null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[GET /api/groups/[groupId]/members]", error);
    return NextResponse.json({ error: "Unable to load members." }, { status: 500 });
  }
}

const inviteSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(50),
});

export async function POST(req: Request, { params }: Ctx) {
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
    const { userIds } = inviteSchema.parse(body);

    const [conv] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(eq(conversations.type, "group"), eq(conversations.groupId, groupId)),
      )
      .limit(1);

    for (const userId of userIds) {
      const [existing] = await db
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(
          and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)),
        )
        .limit(1);

      if (!existing) {
        await db.insert(groupMembers).values({
          groupId,
          userId,
          role: "member",
        });

        if (conv) {
          await db
            .insert(conversationParticipants)
            .values({ conversationId: conv.id, userId })
            .onConflictDoNothing();
        }
      }
    }

    return NextResponse.json({ ok: true, added: userIds.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST /api/groups/[groupId]/members]", error);
    return NextResponse.json({ error: "Unable to invite members." }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const viewer = await requireDbUser(req);
    const { groupId } = params;

    const url = new URL(req.url);
    const targetUserId = url.searchParams.get("userId") ?? viewer.id;

    const [viewerMembership] = await db
      .select({ role: groupMembers.role })
      .from(groupMembers)
      .where(
        and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, viewer.id)),
      )
      .limit(1);

    const isSelf = targetUserId === viewer.id;
    const isAdminOrOwner =
      viewerMembership?.role === "owner" || viewerMembership?.role === "admin";

    if (!isSelf && !isAdminOrOwner) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    if (isSelf && viewerMembership?.role === "owner") {
      return NextResponse.json(
        { error: "Owner cannot leave. Transfer ownership or delete the group." },
        { status: 400 },
      );
    }

    await db
      .delete(groupMembers)
      .where(
        and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, targetUserId)),
      );

    const [conv] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(eq(conversations.type, "group"), eq(conversations.groupId, groupId)),
      )
      .limit(1);

    if (conv) {
      await db
        .delete(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, conv.id),
            eq(conversationParticipants.userId, targetUserId),
          ),
        );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[DELETE /api/groups/[groupId]/members]", error);
    return NextResponse.json({ error: "Unable to remove member." }, { status: 500 });
  }
}
