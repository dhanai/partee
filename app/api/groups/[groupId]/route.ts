import { NextResponse } from "next/server";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  conversations,
  groupMembers,
  groups,
} from "@/db/schema";
import { requireDbUser } from "@/lib/auth";

type Ctx = { params: { groupId: string } };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const viewer = await requireDbUser(req);
    const { groupId } = params;

    const [group] = await db
      .select()
      .from(groups)
      .where(eq(groups.id, groupId))
      .limit(1);

    if (!group) {
      return NextResponse.json({ error: "Group not found." }, { status: 404 });
    }

    const [membership] = await db
      .select({ role: groupMembers.role })
      .from(groupMembers)
      .where(
        and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, viewer.id)),
      )
      .limit(1);

    const [{ memberCount }] = await db
      .select({ memberCount: count() })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, groupId));

    const [conv] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(eq(conversations.type, "group"), eq(conversations.groupId, groupId)),
      )
      .limit(1);

    return NextResponse.json({
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
        imageUrl: group.imageUrl,
        heroImageUrl: group.heroImageUrl,
        joinPolicy: group.joinPolicy,
        createdBy: group.createdBy,
        createdAt: group.createdAt.toISOString(),
        memberCount: Number(memberCount),
        myRole: membership?.role ?? null,
        conversationId: conv?.id ?? null,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[GET /api/groups/[groupId]]", error);
    return NextResponse.json({ error: "Unable to load group." }, { status: 500 });
  }
}

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  imageUrl: z.string().url().nullable().optional(),
  heroImageUrl: z.string().url().nullable().optional(),
  joinPolicy: z.enum(["public", "approval", "invite_only"]).optional(),
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
    const input = updateSchema.parse(body);

    const updates: Record<string, unknown> = {};
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.imageUrl !== undefined) updates.imageUrl = input.imageUrl;
    if (input.heroImageUrl !== undefined) updates.heroImageUrl = input.heroImageUrl;
    if (input.joinPolicy !== undefined) updates.joinPolicy = input.joinPolicy;

    if (Object.keys(updates).length > 0) {
      await db.update(groups).set(updates).where(eq(groups.id, groupId));
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[PATCH /api/groups/[groupId]]", error);
    return NextResponse.json({ error: "Unable to update group." }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
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

    if (!membership || membership.role !== "owner") {
      return NextResponse.json({ error: "Only the owner can delete this group." }, { status: 403 });
    }

    await db.delete(groups).where(eq(groups.id, groupId));

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[DELETE /api/groups/[groupId]]", error);
    return NextResponse.json({ error: "Unable to delete group." }, { status: 500 });
  }
}
