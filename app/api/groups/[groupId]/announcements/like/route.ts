import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { postLikes, groupMembers } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { publishPostLikeUpdated } from "@/lib/parfade-ably-publish";

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
      .select({ id: postLikes.id })
      .from(postLikes)
      .where(
        and(
          eq(postLikes.postId, announcementId),
          eq(postLikes.userId, viewer.id),
        ),
      )
      .limit(1);

    if (existing) {
      await db.delete(postLikes).where(eq(postLikes.id, existing.id));
      await publishPostLikeUpdated(announcementId, viewer.id, false).catch((e) =>
        console.error("[like] ably", e),
      );
      return NextResponse.json({ liked: false });
    }

    await db.insert(postLikes).values({
      postId: announcementId,
      userId: viewer.id,
    });

    await publishPostLikeUpdated(announcementId, viewer.id, true).catch((e) =>
      console.error("[like] ably", e),
    );

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
