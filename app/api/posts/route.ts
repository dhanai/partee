import { NextResponse } from "next/server";
import { and, count, desc, eq, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  postComments,
  postLikes,
  posts,
  groupMembers,
  groups,
  userFollows,
  users,
} from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { notifyGroupPost, notifyProfilePost } from "@/lib/notify-user";
import { publishGroupActivityUpdated } from "@/lib/parfade-ably-publish";
import { withPerfTimer } from "@/lib/profile-activity-perf";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const createSchema = z.object({
  body: z.string().min(1).max(2000),
  imageUrl: z.string().url().optional(),
  isPinned: z.boolean().default(true),
  groupId: z.string().uuid().optional(),
  profileUserId: z.string().uuid().optional(),
  scope: z.enum(["group", "profile"]).default("group"),
});

export async function GET(req: Request) {
  const done = withPerfTimer("GET /api/posts");
  try {
    const viewer = await requireDbUser(req);
    const url = new URL(req.url);
    const groupId = url.searchParams.get("groupId");
    const userId = url.searchParams.get("userId");
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? "20")));
    const cursor = url.searchParams.get("cursor");
    const cursorDate = cursor ? new Date(cursor) : null;

    let where;
    if (groupId) {
      where = cursorDate
        ? and(eq(posts.groupId, groupId), eq(posts.scope, "group"), lt(posts.createdAt, cursorDate))
        : and(eq(posts.groupId, groupId), eq(posts.scope, "group"));
    } else if (userId) {
      where = cursorDate
        ? and(
            eq(posts.scope, "profile"),
            eq(posts.hiddenOnProfile, false),
            eq(posts.profileUserId, userId),
            lt(posts.createdAt, cursorDate),
          )
        : and(
            eq(posts.scope, "profile"),
            eq(posts.hiddenOnProfile, false),
            eq(posts.profileUserId, userId),
          );
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
        profileUserId: posts.profileUserId,
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

    const postIds = rows.map((r) => r.id);
    let likeCountMap = new Map<string, number>();
    let commentCountMap = new Map<string, number>();
    let viewerLikeSet = new Set<string>();

    if (postIds.length > 0) {
      const [likeCounts, commentCounts, viewerLikes] = await Promise.all([
        db
          .select({
            postId: postLikes.postId,
            count: count(),
          })
          .from(postLikes)
          .where(inArray(postLikes.postId, postIds))
          .groupBy(postLikes.postId),
        db
          .select({
            postId: postComments.postId,
            count: count(),
          })
          .from(postComments)
          .where(inArray(postComments.postId, postIds))
          .groupBy(postComments.postId),
        db
          .select({ postId: postLikes.postId })
          .from(postLikes)
          .where(
            and(inArray(postLikes.postId, postIds), eq(postLikes.userId, viewer.id)),
          ),
      ]);
      likeCountMap = new Map(likeCounts.map((r) => [r.postId, Number(r.count)]));
      commentCountMap = new Map(commentCounts.map((r) => [r.postId, Number(r.count)]));
      viewerLikeSet = new Set(viewerLikes.map((r) => r.postId));
    }

    return NextResponse.json({
      posts: rows.map((r) => ({
        id: r.id,
        body: r.body,
        imageUrl: r.imageUrl,
        isPinned: r.isPinned,
        groupId: r.groupId,
        scope: r.scope,
        profileUserId: r.profileUserId,
        createdAt: r.createdAt.toISOString(),
        likeCount: likeCountMap.get(r.id) ?? 0,
        commentCount: commentCountMap.get(r.id) ?? 0,
        viewerLiked: viewerLikeSet.has(r.id),
        user: { id: r.userId, name: r.userName, avatar: r.userAvatar },
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[GET /api/posts]", error);
    return NextResponse.json({ error: "Unable to load posts." }, { status: 500 });
  } finally {
    const url = new URL(req.url);
    done({
      groupId: url.searchParams.get("groupId"),
      userId: url.searchParams.get("userId"),
      limit: url.searchParams.get("limit"),
      cursor: url.searchParams.get("cursor"),
    });
  }
}

export async function POST(req: Request) {
  try {
    const viewer = await requireDbUser(req);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const postLimiter = rateLimit(ip, `post-create:${viewer.id}`, 12, 60_000);
    if (!postLimiter.success) return rateLimitResponse();
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

      await Promise.all([
        notifyGroupPost({
          groupId: input.groupId,
          groupName: group?.name ?? "Group",
          senderUserId: viewer.id,
          senderName: viewer.name,
          postId: post.id,
          body: input.body,
          memberUserIds: memberRows.map((m) => m.userId),
        }),
        publishGroupActivityUpdated(input.groupId, "post").catch((e) =>
          console.error("[POST /api/posts] group-activity ably", e),
        ),
      ]);

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
    const profileUserId = input.profileUserId ?? viewer.id;
    if (profileUserId !== viewer.id) {
      const [viewerToTarget, targetToViewer] = await Promise.all([
        db
          .select({ status: userFollows.status })
          .from(userFollows)
          .where(
            and(
              eq(userFollows.followerId, viewer.id),
              eq(userFollows.followedId, profileUserId),
              eq(userFollows.status, "accepted"),
            ),
          )
          .limit(1),
        db
          .select({ status: userFollows.status })
          .from(userFollows)
          .where(
            and(
              eq(userFollows.followerId, profileUserId),
              eq(userFollows.followedId, viewer.id),
              eq(userFollows.status, "accepted"),
            ),
          )
          .limit(1),
      ]);
      if (!viewerToTarget || !targetToViewer) {
        return NextResponse.json(
          { error: "Only mutual friends can post to this profile." },
          { status: 403 },
        );
      }
    }

    const [post] = await db
      .insert(posts)
      .values({
        groupId: null,
        userId: viewer.id,
        profileUserId,
        scope: "profile",
        body: input.body,
        imageUrl: input.imageUrl ?? null,
        isPinned: false,
        hiddenOnProfile: false,
      })
      .returning();

    if (profileUserId !== viewer.id) {
      await notifyProfilePost({
        recipientUserId: profileUserId,
        senderUserId: viewer.id,
        senderName: viewer.name,
        postId: post.id,
        previewBody: input.body,
      });
    }

    return NextResponse.json({
      post: {
        id: post.id,
        body: post.body,
        imageUrl: post.imageUrl,
        isPinned: post.isPinned,
        profileUserId: post.profileUserId,
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
