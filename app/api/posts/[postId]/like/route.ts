import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { groupMembers, inAppNotifications, postLikes, posts } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { notifyPostInteraction } from "@/lib/notify-user";
import { publishPostLikeUpdated } from "@/lib/parfade-ably-publish";

type Ctx = { params: { postId: string } };

export async function POST(req: Request, { params }: Ctx) {
  try {
    const viewer = await requireDbUser(req);
    const { postId } = params;

    const [post] = await db
      .select({ id: posts.id, userId: posts.userId, groupId: posts.groupId })
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);
    if (!post) {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
    }
    if (post.groupId) {
      const [membership] = await db
        .select({ userId: groupMembers.userId })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, post.groupId), eq(groupMembers.userId, viewer.id)))
        .limit(1);
      if (!membership) {
        return NextResponse.json({ error: "Not allowed." }, { status: 403 });
      }
    }

    const [existing] = await db
      .select({ id: postLikes.id })
      .from(postLikes)
      .where(and(eq(postLikes.postId, postId), eq(postLikes.userId, viewer.id)))
      .limit(1);

    if (existing) {
      await db.delete(postLikes).where(eq(postLikes.id, existing.id));
      await db
        .delete(inAppNotifications)
        .where(
          and(
            eq(inAppNotifications.type, "post_liked"),
            sql`${inAppNotifications.data}->>'actorUserId' = ${viewer.id}`,
            sql`${inAppNotifications.data}->>'postId' = ${postId}`,
          ),
        )
        .catch(() => {});
      await publishPostLikeUpdated(postId, viewer.id, false).catch(() => {});
      return NextResponse.json({ liked: false });
    }

    await db.insert(postLikes).values({ postId, userId: viewer.id });

    if (post.userId !== viewer.id) {
      await notifyPostInteraction({
        recipientUserId: post.userId,
        actorUserId: viewer.id,
        actorName: viewer.name,
        postId,
        kind: "liked",
        groupId: post.groupId,
      }).catch(() => {});
    }

    await publishPostLikeUpdated(postId, viewer.id, true).catch(() => {});
    return NextResponse.json({ liked: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST /api/posts/[postId]/like]", error);
    return NextResponse.json({ error: "Unable to toggle like." }, { status: 500 });
  }
}
