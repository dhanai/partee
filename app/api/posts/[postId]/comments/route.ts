import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { postComments, posts, users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";

type Ctx = { params: { postId: string } };

export async function GET(req: Request, { params }: Ctx) {
  try {
    await requireDbUser(req);
    const { postId } = params;

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

    const [post] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);

    if (!post) {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
    }

    const input = createSchema.parse(await req.json());

    const [comment] = await db
      .insert(postComments)
      .values({
        postId,
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
