import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { posts, groupMembers } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";

type Ctx = { params: { postId: string } };

const editSchema = z.object({
  body: z.string().min(1).max(2000).optional(),
  imageUrl: z.string().url().nullable().optional(),
  isPinned: z.boolean().optional(),
  hideFromProfile: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const viewer = await requireDbUser(req);
    const { postId } = params;

    const [existing] = await db
      .select({
        userId: posts.userId,
        groupId: posts.groupId,
        scope: posts.scope,
        profileUserId: posts.profileUserId,
      })
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
    }

    const isAuthor = existing.userId === viewer.id;
    const profileOwnerId = existing.profileUserId ?? existing.userId;
    const isProfileOwner = existing.scope === "profile" && profileOwnerId === viewer.id;
    let isAdminOrOwner = false;

    if (existing.groupId) {
      const [membership] = await db
        .select({ role: groupMembers.role })
        .from(groupMembers)
        .where(
          and(eq(groupMembers.groupId, existing.groupId), eq(groupMembers.userId, viewer.id)),
        )
        .limit(1);

      isAdminOrOwner = membership?.role === "owner" || membership?.role === "admin";
    }

    if (!isAuthor && !isAdminOrOwner && !isProfileOwner) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const json = await req.json();
    const input = editSchema.parse(json);

    const updates: Record<string, unknown> = {};
    if (input.body !== undefined && (isAuthor || isAdminOrOwner)) updates.body = input.body;
    if (input.imageUrl !== undefined && (isAuthor || isAdminOrOwner)) {
      updates.imageUrl = input.imageUrl;
    }
    const canPin = existing.groupId ? isAdminOrOwner : isAuthor || isProfileOwner;
    if (input.isPinned !== undefined && canPin) updates.isPinned = input.isPinned;
    if (input.hideFromProfile !== undefined && isProfileOwner) {
      updates.hiddenOnProfile = input.hideFromProfile;
    }

    if (Object.keys(updates).length > 0) {
      await db
        .update(posts)
        .set(updates)
        .where(eq(posts.id, postId));
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[PATCH /api/posts/[postId]]", error);
    return NextResponse.json({ error: "Unable to edit post." }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const viewer = await requireDbUser(req);
    const { postId } = params;

    const [existing] = await db
      .select({
        userId: posts.userId,
        groupId: posts.groupId,
        scope: posts.scope,
        profileUserId: posts.profileUserId,
      })
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
    }

    const isAuthor = existing.userId === viewer.id;
    const profileOwnerId = existing.profileUserId ?? existing.userId;
    const isProfileOwner = existing.scope === "profile" && profileOwnerId === viewer.id;
    let isAdminOrOwner = false;

    if (existing.groupId) {
      const [membership] = await db
        .select({ role: groupMembers.role })
        .from(groupMembers)
        .where(
          and(eq(groupMembers.groupId, existing.groupId), eq(groupMembers.userId, viewer.id)),
        )
        .limit(1);

      isAdminOrOwner = membership?.role === "owner" || membership?.role === "admin";
    }

    if (!isAuthor && !isAdminOrOwner && !isProfileOwner) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    await db.delete(posts).where(eq(posts.id, postId));

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[DELETE /api/posts/[postId]]", error);
    return NextResponse.json({ error: "Unable to delete post." }, { status: 500 });
  }
}
