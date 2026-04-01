import { NextResponse } from "next/server";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { groupMembers, postCommentLikes, postComments, posts, users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { notifyPostInteraction } from "@/lib/notify-user";
import { publishPostCommentAdded } from "@/lib/parfade-ably-publish";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

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
        parentCommentId: postComments.parentCommentId,
        replyToCommentId: postComments.replyToCommentId,
        userId: postComments.userId,
        userName: users.name,
        userAvatar: users.avatar,
      })
      .from(postComments)
      .innerJoin(users, eq(users.id, postComments.userId))
      .where(eq(postComments.postId, postId))
      .orderBy(asc(postComments.createdAt))
      .limit(100);

    const commentIds = rows.map((row) => row.id);
    const likeCountMap = new Map<string, number>();
    const viewerLikedSet = new Set<string>();

    if (commentIds.length > 0) {
      const likeRows = await db
        .select({
          commentId: postCommentLikes.commentId,
          count: sql<number>`count(*)::int`,
        })
        .from(postCommentLikes)
        .where(inArray(postCommentLikes.commentId, commentIds))
        .groupBy(postCommentLikes.commentId);
      for (const row of likeRows) {
        likeCountMap.set(row.commentId, Number(row.count) || 0);
      }

      const viewerLikeRows = await db
        .select({ commentId: postCommentLikes.commentId })
        .from(postCommentLikes)
        .where(
          and(
            eq(postCommentLikes.userId, viewer.id),
            inArray(postCommentLikes.commentId, commentIds),
          ),
        );
      for (const row of viewerLikeRows) viewerLikedSet.add(row.commentId);
    }

    return NextResponse.json({
      comments: rows.map((r) => ({
        id: r.id,
        body: r.body,
        createdAt: r.createdAt.toISOString(),
        parentCommentId: r.parentCommentId,
        replyToCommentId: r.replyToCommentId,
        likeCount: likeCountMap.get(r.id) ?? 0,
        viewerLiked: viewerLikedSet.has(r.id),
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
  parentCommentId: z.string().uuid().optional().nullable(),
  replyToCommentId: z.string().uuid().optional().nullable(),
});

export async function POST(req: Request, { params }: Ctx) {
  try {
    const viewer = await requireDbUser(req);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const commentLimiter = rateLimit(ip, `post-comment:${viewer.id}`, 24, 60_000);
    if (!commentLimiter.success) return rateLimitResponse();
    const { postId } = params;
    const input = createSchema.parse(await req.json());

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

    let parentCommentId: string | null = input.parentCommentId ?? null;
    let replyToCommentId: string | null = input.replyToCommentId ?? null;
    let replyTargetComment: {
      id: string;
      postId: string;
      parentCommentId: string | null;
      userId: string;
    } | null = null;

    if (replyToCommentId && !parentCommentId) {
      const [replyTarget] = await db
        .select({
          id: postComments.id,
          postId: postComments.postId,
          parentCommentId: postComments.parentCommentId,
          userId: postComments.userId,
        })
        .from(postComments)
        .where(eq(postComments.id, replyToCommentId))
        .limit(1);
      if (!replyTarget || replyTarget.postId !== postId) {
        return NextResponse.json({ error: "Reply target not found." }, { status: 400 });
      }
      replyTargetComment = replyTarget;
      parentCommentId = replyTarget.parentCommentId ?? replyTarget.id;
      replyToCommentId = replyTarget.id;
    }

    if (parentCommentId) {
      const [parentComment] = await db
        .select({
          id: postComments.id,
          postId: postComments.postId,
          parentCommentId: postComments.parentCommentId,
        })
        .from(postComments)
        .where(eq(postComments.id, parentCommentId))
        .limit(1);
      if (!parentComment || parentComment.postId !== postId) {
        return NextResponse.json({ error: "Parent comment not found." }, { status: 400 });
      }
      if (parentComment.parentCommentId) {
        return NextResponse.json({ error: "Parent comment must be top-level." }, { status: 400 });
      }
    }

    if (replyToCommentId && parentCommentId) {
      if (!replyTargetComment) {
        const [replyTarget] = await db
          .select({
            id: postComments.id,
            postId: postComments.postId,
            parentCommentId: postComments.parentCommentId,
            userId: postComments.userId,
          })
          .from(postComments)
          .where(eq(postComments.id, replyToCommentId))
          .limit(1);
        replyTargetComment = replyTarget ?? null;
      }
      if (!replyTargetComment || replyTargetComment.postId !== postId) {
        return NextResponse.json({ error: "Reply target not found." }, { status: 400 });
      }
      const inSameThread =
        replyTargetComment.id === parentCommentId ||
        replyTargetComment.parentCommentId === parentCommentId;
      if (!inSameThread) {
        return NextResponse.json({ error: "Reply target must be in same thread." }, { status: 400 });
      }
    }

    const [comment] = await db
      .insert(postComments)
      .values({
        postId,
        userId: viewer.id,
        parentCommentId,
        replyToCommentId,
        body: input.body,
      })
      .returning();

    const commentPayload = {
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      parentCommentId: comment.parentCommentId,
      replyToCommentId: comment.replyToCommentId,
      likeCount: 0,
      viewerLiked: false,
      user: { id: viewer.id, name: viewer.name, avatar: viewer.avatar },
    };

    await publishPostCommentAdded(postId, commentPayload).catch((e) =>
      console.error("[POST comments] ably publish", e),
    );

    if (comment.parentCommentId && replyTargetComment) {
      if (replyTargetComment.userId !== viewer.id) {
        await notifyPostInteraction({
          recipientUserId: replyTargetComment.userId,
          actorUserId: viewer.id,
          actorName: viewer.name,
          postId,
          kind: "commented",
          groupId: post.groupId,
          commentBody: input.body,
          commentContext: "reply",
          commentId: comment.id,
          parentCommentId: comment.parentCommentId,
          replyToCommentId: comment.replyToCommentId,
        }).catch(() => {});
      }
    } else if (post.userId !== viewer.id) {
      await notifyPostInteraction({
        recipientUserId: post.userId,
        actorUserId: viewer.id,
        actorName: viewer.name,
        postId,
        kind: "commented",
        groupId: post.groupId,
        commentBody: input.body,
        commentContext: "comment",
        commentId: comment.id,
        parentCommentId: comment.parentCommentId,
        replyToCommentId: comment.replyToCommentId,
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
