import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { posts, groupMembers, groups, users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { notifyGroupPost } from "@/lib/notify-user";

const createSchema = z.object({
  body: z.string().min(1).max(2000),
  imageUrl: z.string().url().optional(),
  isPinned: z.boolean().default(true),
  groupId: z.string().uuid().optional(),
  scope: z.enum(["group", "profile"]).default("group"),
});

export async function GET(req: Request) {
  try {
    await requireDbUser(req);
    const url = new URL(req.url);
    const groupId = url.searchParams.get("groupId");
    const userId = url.searchParams.get("userId");
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? "20")));
    const cursor = url.searchParams.get("cursor");

    let where;
    if (groupId) {
      where = cursor
        ? and(eq(posts.groupId, groupId), eq(posts.scope, "group"))
        : and(eq(posts.groupId, groupId), eq(posts.scope, "group"));
    } else if (userId) {
      where = and(eq(posts.userId, userId), eq(posts.scope, "profile"));
    } else {
      return NextResponse.json({ error: "Provide groupId or userId." }, { status: 400 });
    }

    const rows = await db
      .select({
        id: posts.id,
        body: posts.body,
        imageUrl: posts.imageUrl,
        isPinned: posts.isPinned,
        groupId: posts.groupId,
        scope: posts.scope,
        createdAt: posts.createdAt,
        userId: posts.userId,
        userName: users.name,
        userAvatar: users.avatar,
      })
      .from(posts)
      .innerJoin(users, eq(users.id, posts.userId))
      .where(where)
      .orderBy(desc(posts.createdAt))
      .limit(limit);

    return NextResponse.json({
      posts: rows.map((r) => ({
        id: r.id,
        body: r.body,
        imageUrl: r.imageUrl,
        isPinned: r.isPinned,
        groupId: r.groupId,
        scope: r.scope,
        createdAt: r.createdAt.toISOString(),
        user: { id: r.userId, name: r.userName, avatar: r.userAvatar },
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[GET /api/posts]", error);
    return NextResponse.json({ error: "Unable to load posts." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const viewer = await requireDbUser(req);
    const body = await req.json();
    const input = createSchema.parse(body);

    if (input.scope === "group") {
      if (!input.groupId) {
        return NextResponse.json({ error: "groupId required for group posts." }, { status: 400 });
      }

      const [membership] = await db
        .select({ role: groupMembers.role })
        .from(groupMembers)
        .where(
          and(eq(groupMembers.groupId, input.groupId), eq(groupMembers.userId, viewer.id)),
        )
        .limit(1);

      if (!membership) {
        return NextResponse.json({ error: "Must be a group member." }, { status: 403 });
      }

      const canPin = membership.role === "owner" || membership.role === "admin";

      const [post] = await db
        .insert(posts)
        .values({
          groupId: input.groupId,
          userId: viewer.id,
          scope: "group",
          body: input.body,
          imageUrl: input.imageUrl ?? null,
          isPinned: canPin && input.isPinned,
        })
        .returning();

      const [group] = await db
        .select({ name: groups.name })
        .from(groups)
        .where(eq(groups.id, input.groupId))
        .limit(1);

      const memberRows = await db
        .select({ userId: groupMembers.userId })
        .from(groupMembers)
        .where(eq(groupMembers.groupId, input.groupId));

      await notifyGroupPost({
        groupId: input.groupId,
        groupName: group?.name ?? "Group",
        senderUserId: viewer.id,
        senderName: viewer.name,
        body: input.body,
        memberUserIds: memberRows.map((m) => m.userId),
      });

      return NextResponse.json({
        post: {
          id: post.id,
          body: post.body,
          imageUrl: post.imageUrl,
          isPinned: post.isPinned,
          groupId: post.groupId,
          scope: post.scope,
          createdAt: post.createdAt.toISOString(),
          user: { id: viewer.id, name: viewer.name, avatar: viewer.avatar },
        },
      });
    }

    // scope === "profile"
    const [post] = await db
      .insert(posts)
      .values({
        groupId: null,
        userId: viewer.id,
        scope: "profile",
        body: input.body,
        imageUrl: input.imageUrl ?? null,
        isPinned: false,
      })
      .returning();

    return NextResponse.json({
      post: {
        id: post.id,
        body: post.body,
        imageUrl: post.imageUrl,
        isPinned: post.isPinned,
        groupId: null,
        scope: post.scope,
        createdAt: post.createdAt.toISOString(),
        user: { id: viewer.id, name: viewer.name, avatar: viewer.avatar },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input.", details: error.flatten() }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST /api/posts]", error);
    return NextResponse.json({ error: "Unable to create post." }, { status: 500 });
  }
}
