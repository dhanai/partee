import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { posts, groupMembers, groups, users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { notifyGroupPost } from "@/lib/notify-user";
import { publishGroupActivityUpdated } from "@/lib/parfade-ably-publish";

type Ctx = { params: { groupId: string } };

export async function GET(req: Request, { params }: Ctx) {
  try {
    await requireDbUser(req);
    const { groupId } = params;

    const rows = await db
      .select({
        id: posts.id,
        body: posts.body,
        imageUrl: posts.imageUrl,
        imageUrls: posts.imageUrls,
        isPinned: posts.isPinned,
        createdAt: posts.createdAt,
        userId: posts.userId,
        userName: users.name,
        userAvatar: users.avatar,
      })
      .from(posts)
      .innerJoin(users, eq(users.id, posts.userId))
      .where(eq(posts.groupId, groupId))
      .orderBy(desc(posts.createdAt))
      .limit(20);

    return NextResponse.json({
      announcements: rows.map((r) => ({
        id: r.id,
        body: r.body,
        imageUrl: r.imageUrl,
        imageUrls: (r.imageUrls ?? []) as string[],
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
  imageUrl: z.string().url().optional(),
  imageUrls: z.array(z.string().url()).max(10).optional(),
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

    if (!membership) {
      return NextResponse.json({ error: "Must be a group member." }, { status: 403 });
    }

    const body = await req.json();
    const input = createSchema.parse(body);
    const normalizedImages = normalizePostImages(input);

    const canPin = membership.role === "owner" || membership.role === "admin";

    const [post] = await db
      .insert(posts)
      .values({
        groupId,
        userId: viewer.id,
        scope: "group",
        body: input.body,
        imageUrl: normalizedImages.imageUrl,
        imageUrls: normalizedImages.imageUrls,
        isPinned: canPin && input.isPinned,
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

    await Promise.all([
      notifyGroupPost({
        groupId,
        groupName: group?.name ?? "Group",
        senderUserId: viewer.id,
        senderName: viewer.name,
        postId: post.id,
        body: input.body,
        memberUserIds: memberRows.map((m) => m.userId),
      }),
      publishGroupActivityUpdated(groupId, "post").catch((e) =>
        console.error("[POST announcements] group-activity ably", e),
      ),
    ]);

    return NextResponse.json({
      announcement: {
        id: post.id,
        body: post.body,
        imageUrl: post.imageUrl,
        imageUrls: (post.imageUrls ?? []) as string[],
        isPinned: post.isPinned,
        createdAt: post.createdAt.toISOString(),
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
    return NextResponse.json({ error: "Unable to create post." }, { status: 500 });
  }
}

const editSchema = z.object({
  id: z.string().uuid(),
  body: z.string().min(1).max(2000).optional(),
  imageUrl: z.string().url().nullable().optional(),
  imageUrls: z.array(z.string().url()).max(10).optional(),
  isPinned: z.boolean().optional(),
});

function normalizePostImages(input: { imageUrl?: string | null; imageUrls?: string[] }) {
  const urls = (input.imageUrls ?? []).map((url) => url.trim()).filter((url) => url.length > 0);
  if (urls.length > 0) return { imageUrls: urls, imageUrl: urls[0] ?? null };
  if (input.imageUrl && input.imageUrl.trim().length > 0) {
    const single = input.imageUrl.trim();
    return { imageUrls: [single], imageUrl: single };
  }
  return { imageUrls: [] as string[], imageUrl: null };
}

export async function PATCH(req: Request, { params }: Ctx) {
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
      return NextResponse.json({ error: "Must be a group member." }, { status: 403 });
    }

    const json = await req.json();
    const input = editSchema.parse(json);

    const isAdminOrOwner = membership.role === "owner" || membership.role === "admin";

    const [existing] = await db
      .select({ userId: posts.userId })
      .from(posts)
      .where(eq(posts.id, input.id))
      .limit(1);

    const isAuthor = existing?.userId === viewer.id;
    if (!isAuthor && !isAdminOrOwner) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const updates: Record<string, unknown> = {};
    if (input.body !== undefined) updates.body = input.body;
    if (input.imageUrl !== undefined) {
      updates.imageUrl = input.imageUrl;
      updates.imageUrls = input.imageUrl ? [input.imageUrl] : [];
    }
    if (input.imageUrls !== undefined) {
      const normalized = normalizePostImages({ imageUrls: input.imageUrls });
      updates.imageUrls = normalized.imageUrls;
      updates.imageUrl = normalized.imageUrl;
    }
    if (input.isPinned !== undefined && isAdminOrOwner) updates.isPinned = input.isPinned;

    if (Object.keys(updates).length > 0) {
      await db
        .update(posts)
        .set(updates)
        .where(
          and(
            eq(posts.id, input.id),
            eq(posts.groupId, groupId),
          ),
        );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[PATCH /api/groups/[groupId]/announcements]", error);
    return NextResponse.json({ error: "Unable to edit post." }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const viewer = await requireDbUser(req);
    const { groupId } = params;

    const url = new URL(req.url);
    const postId = url.searchParams.get("id");
    if (!postId) {
      return NextResponse.json({ error: "Missing post id." }, { status: 400 });
    }

    const [membership] = await db
      .select({ role: groupMembers.role })
      .from(groupMembers)
      .where(
        and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, viewer.id)),
      )
      .limit(1);

    if (!membership) {
      return NextResponse.json({ error: "Must be a group member." }, { status: 403 });
    }

    const isAdminOrOwner = membership.role === "owner" || membership.role === "admin";
    const [existing] = await db
      .select({ userId: posts.userId })
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
    }
    if (existing.userId !== viewer.id && !isAdminOrOwner) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    await db
      .delete(posts)
      .where(
        and(
          eq(posts.id, postId),
          eq(posts.groupId, groupId),
        ),
      );

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[DELETE /api/groups/[groupId]/announcements]", error);
    return NextResponse.json({ error: "Unable to delete post." }, { status: 500 });
  }
}
