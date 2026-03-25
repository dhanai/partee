import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { announcementLikes, groupMembers } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";

type Ctx = { params: { groupId: string } };

const likeSchema = z.object({
  announcementId: z.string().uuid(),
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

    if (!membership) {
      return NextResponse.json({ error: "Not a member." }, { status: 403 });
    }

    const body = await req.json();
    const { announcementId } = likeSchema.parse(body);

    const [existing] = await db
      .select({ id: announcementLikes.id })
      .from(announcementLikes)
      .where(
        and(
          eq(announcementLikes.announcementId, announcementId),
          eq(announcementLikes.userId, viewer.id),
        ),
      )
      .limit(1);

    if (existing) {
      await db.delete(announcementLikes).where(eq(announcementLikes.id, existing.id));
      return NextResponse.json({ liked: false });
    }

    await db.insert(announcementLikes).values({
      announcementId,
      userId: viewer.id,
    });

    return NextResponse.json({ liked: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST /api/groups/[groupId]/announcements/like]", error);
    return NextResponse.json({ error: "Unable to toggle like." }, { status: 500 });
  }
}
