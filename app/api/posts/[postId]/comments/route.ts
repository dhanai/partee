import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { groupMembers, postComments, posts, users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { notifyPostInteraction } from "@/lib/notify-user";
import { publishPostCommentAdded } from "@/lib/parfade-ably-publish";

type Ctx = { params: { postId: string } };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const viewer = await requireDbUser(req);
    const { postId } = params;

    const [post] = await db
      .select({ id: posts.id, groupId: posts.groupId, userId: posts.userId })
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

    const rows = await db
      .select({
        id: postComments.id,
        body: postComments.body,
        createdAt: postComments.createdAt,
        userId: postComments.userId,
        userName: users.name,
        userAvatar: users.avatar,
      })
      .from(postComments)
      .innerJoin(users, eq(users.id, postComments.userId))
      .where(eq(postComments.postId, postId))
      .orderBy(asc(postComments.createdAt))
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
    console.error("[GET /api/posts/[postId]/comments]", error);
    return NextResponse.json({ error: "Unable to load comments." }, { status: 500 });
  }
}

const createSchema = z.object({
  body: z.string().min(1).max(2000),
});

export async function POST(req: Request, { params }: Ctx) {
  try {
    const viewer = await requireDbUser(req);
    const { postId } = params;
    const input = createSchema.parse(await req.json());

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
      .insert(postComments)
      .values({
        postId,
        userId: viewer.id,
        body: input.body,
      })
      .returning();

    const commentPayload = {
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      user: { id: viewer.id, name: viewer.name, avatar: viewer.avatar },
    };

    await publishPostCommentAdded(postId, commentPayload).catch((e) =>
      console.error("[POST comments] ably publish", e),
    );

    if (post.userId !== viewer.id) {
      await notifyPostInteraction({
        recipientUserId: post.userId,
        actorUserId: viewer.id,
        actorName: viewer.name,
        postId,
        kind: "commented",
        groupId: post.groupId,
        commentBody: input.body,
      }).catch(() => {});
    }

    return NextResponse.json({ comment: commentPayload });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST /api/posts/[postId]/comments]", error);
    return NextResponse.json({ error: "Unable to create comment." }, { status: 500 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function DELETE(req: Request, _ctx: Ctx) {
  try {
    const viewer = await requireDbUser(req);

    const url = new URL(req.url);
    const commentId = url.searchParams.get("id");
    if (!commentId) {
      return NextResponse.json({ error: "Missing comment id." }, { status: 400 });
    }

    const [existing] = await db
      .select({ userId: postComments.userId })
      .from(postComments)
      .where(eq(postComments.id, commentId))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Comment not found." }, { status: 404 });
    }

    if (existing.userId !== viewer.id) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    await db.delete(postComments).where(eq(postComments.id, commentId));

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[DELETE /api/posts/[postId]/comments]", error);
    return NextResponse.json({ error: "Unable to delete comment." }, { status: 500 });
  }
}
