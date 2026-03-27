import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { postLikes, posts } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";

type Ctx = { params: { postId: string } };

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

    const [existing] = await db
      .select({ id: postLikes.id })
      .from(postLikes)
      .where(
        and(
          eq(postLikes.postId, postId),
          eq(postLikes.userId, viewer.id),
        ),
      )
      .limit(1);

    if (existing) {
      await db.delete(postLikes).where(eq(postLikes.id, existing.id));
      return NextResponse.json({ liked: false });
    }

    await db.insert(postLikes).values({
      postId,
      userId: viewer.id,
    });

    return NextResponse.json({ liked: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST /api/posts/[postId]/like]", error);
    return NextResponse.json({ error: "Unable to toggle like." }, { status: 500 });
  }
}
