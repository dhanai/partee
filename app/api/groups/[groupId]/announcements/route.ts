import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { groupAnnouncements, groupMembers, groups, users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { notifyGroupAnnouncement } from "@/lib/notify-user";

type Ctx = { params: { groupId: string } };

export async function GET(req: Request, { params }: Ctx) {
  try {
    await requireDbUser(req);
    const { groupId } = params;

    const rows = await db
      .select({
        id: groupAnnouncements.id,
        body: groupAnnouncements.body,
        isPinned: groupAnnouncements.isPinned,
        createdAt: groupAnnouncements.createdAt,
        userId: groupAnnouncements.userId,
        userName: users.name,
        userAvatar: users.avatar,
      })
      .from(groupAnnouncements)
      .innerJoin(users, eq(users.id, groupAnnouncements.userId))
      .where(eq(groupAnnouncements.groupId, groupId))
      .orderBy(desc(groupAnnouncements.createdAt))
      .limit(20);

    return NextResponse.json({
      announcements: rows.map((r) => ({
        id: r.id,
        body: r.body,
        isPinned: r.isPinned,
        createdAt: r.createdAt.toISOString(),
        user: { id: r.userId, name: r.userName, avatar: r.userAvatar },
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[GET /api/groups/[groupId]/announcements]", error);
    return NextResponse.json({ error: "Unable to load announcements." }, { status: 500 });
  }
}

const createSchema = z.object({
  body: z.string().min(1).max(2000),
  isPinned: z.boolean().default(true),
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
    const input = createSchema.parse(body);

    const [announcement] = await db
      .insert(groupAnnouncements)
      .values({
        groupId,
        userId: viewer.id,
        body: input.body,
        isPinned: input.isPinned,
      })
      .returning();

    const [group] = await db
      .select({ name: groups.name })
      .from(groups)
      .where(eq(groups.id, groupId))
      .limit(1);

    const memberRows = await db
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, groupId));

    void notifyGroupAnnouncement({
      groupId,
      groupName: group?.name ?? "Group",
      senderUserId: viewer.id,
      senderName: viewer.name,
      body: input.body,
      memberUserIds: memberRows.map((m) => m.userId),
    });

    return NextResponse.json({
      announcement: {
        id: announcement.id,
        body: announcement.body,
        isPinned: announcement.isPinned,
        createdAt: announcement.createdAt.toISOString(),
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
    console.error("[POST /api/groups/[groupId]/announcements]", error);
    return NextResponse.json({ error: "Unable to create announcement." }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const viewer = await requireDbUser(req);
    const { groupId } = params;

    const url = new URL(req.url);
    const announcementId = url.searchParams.get("id");
    if (!announcementId) {
      return NextResponse.json({ error: "Missing announcement id." }, { status: 400 });
    }

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

    await db
      .delete(groupAnnouncements)
      .where(
        and(
          eq(groupAnnouncements.id, announcementId),
          eq(groupAnnouncements.groupId, groupId),
        ),
      );

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[DELETE /api/groups/[groupId]/announcements]", error);
    return NextResponse.json({ error: "Unable to delete announcement." }, { status: 500 });
  }
}
