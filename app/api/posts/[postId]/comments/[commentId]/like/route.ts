import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { groupMembers, postCommentLikes, postComments, posts } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";

type Ctx = { params: { postId: string; commentId: string } };

export async function POST(req: Request, { params }: Ctx) {
  try {
    const viewer = await requireDbUser(req);
    const { postId, commentId } = params;

    const [post] = await db
      .select({ id: posts.id, groupId: posts.groupId })
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

    const [comment] = await db
      .select({ id: postComments.id, postId: postComments.postId })
      .from(postComments)
      .where(eq(postComments.id, commentId))
      .limit(1);
    if (!comment || comment.postId !== postId) {
      return NextResponse.json({ error: "Comment not found." }, { status: 404 });
    }

    const [existing] = await db
      .select({ id: postCommentLikes.id })
      .from(postCommentLikes)
      .where(
        and(eq(postCommentLikes.commentId, commentId), eq(postCommentLikes.userId, viewer.id)),
      )
      .limit(1);

    let liked = false;
    if (existing) {
      await db.delete(postCommentLikes).where(eq(postCommentLikes.id, existing.id));
    } else {
      await db.insert(postCommentLikes).values({
        commentId,
        userId: viewer.id,
      });
      liked = true;
    }

    return NextResponse.json({ liked });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST /api/posts/[postId]/comments/[commentId]/like]", error);
    return NextResponse.json({ error: "Unable to update comment like." }, { status: 500 });
  }
}
