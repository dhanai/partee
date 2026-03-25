import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { announcementComments, groupAnnouncements, groupMembers, users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";

type Ctx = { params: { groupId: string } };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const viewer = await requireDbUser(req);
    const { groupId } = params;

    const url = new URL(req.url);
    const announcementId = url.searchParams.get("announcementId");
    if (!announcementId) {
      return NextResponse.json({ error: "Missing announcementId." }, { status: 400 });
    }

    const [membership] = await db
      .select({ role: groupMembers.role })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, viewer.id)))
      .limit(1);

    if (!membership) {
      return NextResponse.json({ error: "Must be a group member." }, { status: 403 });
    }

    const rows = await db
      .select({
        id: announcementComments.id,
        body: announcementComments.body,
        createdAt: announcementComments.createdAt,
        userId: announcementComments.userId,
        userName: users.name,
        userAvatar: users.avatar,
      })
      .from(announcementComments)
      .innerJoin(users, eq(users.id, announcementComments.userId))
      .where(eq(announcementComments.announcementId, announcementId))
      .orderBy(asc(announcementComments.createdAt))
      .limit(100);

    return NextResponse.json({
      comments: rows.map((r) => ({
        id: r.id,
        body: r.body,
        createdAt: r.createdAt.toISOString(),
        user: { id: r.userId, name: r.userName, avatar: r.userAvatar },
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[GET comments]", error);
    return NextResponse.json({ error: "Unable to load comments." }, { status: 500 });
  }
}

const createSchema = z.object({
  announcementId: z.string().uuid(),
  body: z.string().min(1).max(2000),
});

export async function POST(req: Request, { params }: Ctx) {
  try {
    const viewer = await requireDbUser(req);
    const { groupId } = params;

    const [membership] = await db
      .select({ role: groupMembers.role })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, viewer.id)))
      .limit(1);

    if (!membership) {
      return NextResponse.json({ error: "Must be a group member." }, { status: 403 });
    }

    const input = createSchema.parse(await req.json());

    const [ann] = await db
      .select({ id: groupAnnouncements.id })
      .from(groupAnnouncements)
      .where(
        and(
          eq(groupAnnouncements.id, input.announcementId),
          eq(groupAnnouncements.groupId, groupId),
        ),
      )
      .limit(1);

    if (!ann) {
      return NextResponse.json({ error: "Announcement not found." }, { status: 404 });
    }

    const [comment] = await db
      .insert(announcementComments)
      .values({
        announcementId: input.announcementId,
        userId: viewer.id,
        body: input.body,
      })
      .returning();

    return NextResponse.json({
      comment: {
        id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
        user: { id: viewer.id, name: viewer.name, avatar: viewer.avatar },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST comments]", error);
    return NextResponse.json({ error: "Unable to create comment." }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const viewer = await requireDbUser(req);
    const { groupId } = params;

    const url = new URL(req.url);
    const commentId = url.searchParams.get("id");
    if (!commentId) {
      return NextResponse.json({ error: "Missing comment id." }, { status: 400 });
    }

    const [membership] = await db
      .select({ role: groupMembers.role })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, viewer.id)))
      .limit(1);

    if (!membership) {
      return NextResponse.json({ error: "Must be a group member." }, { status: 403 });
    }

    const [existing] = await db
      .select({ userId: announcementComments.userId })
      .from(announcementComments)
      .where(eq(announcementComments.id, commentId))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Comment not found." }, { status: 404 });
    }

    const isAdminOrOwner = membership.role === "owner" || membership.role === "admin";
    if (existing.userId !== viewer.id && !isAdminOrOwner) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    await db.delete(announcementComments).where(eq(announcementComments.id, commentId));

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[DELETE comments]", error);
    return NextResponse.json({ error: "Unable to delete comment." }, { status: 500 });
  }
}
