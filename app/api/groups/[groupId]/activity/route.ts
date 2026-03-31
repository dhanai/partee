import { NextResponse } from "next/server";
import { and, count, desc, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import {
  postComments,
  postLikes,
  posts,
  groupMembers,
  rounds,
  users,
} from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { getViewerFollowedIds, scorePost } from "@/lib/feed-scoring";

type Ctx = { params: { groupId: string } };

type ActivityItem =
  | { type: "post"; id: string; body: string; imageUrl: string | null; isPinned: boolean; createdAt: string; likeCount: number; commentCount: number; viewerLiked: boolean; user: { id: string; name: string; avatar: string | null } }
  | { type: "round_created"; id: string; roundId: string; roundToken: string; courseName: string | null; targetDate: string; createdAt: string; user: { id: string; name: string; avatar: string | null } }
  | { type: "member_joined"; id: string; joinedAt: string; user: { id: string; name: string; avatar: string | null } };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const viewer = await requireDbUser(req);
    const { groupId } = params;

    const url = new URL(req.url);
    const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? "20")));
    const cursor = url.searchParams.get("cursor");

    const cursorDate = cursor ? new Date(cursor) : null;

    // ── Posts ────────────────────────────────────────────────────
    const postWhere = cursorDate
      ? and(eq(posts.groupId, groupId), lt(posts.createdAt, cursorDate))
      : eq(posts.groupId, groupId);

    const postRows = await db
      .select({
        id: posts.id,
        body: posts.body,
        imageUrl: posts.imageUrl,
        isPinned: posts.isPinned,
        createdAt: posts.createdAt,
        userId: posts.userId,
        userName: users.name,
        userAvatar: users.avatar,
      })
      .from(posts)
      .innerJoin(users, eq(users.id, posts.userId))
      .where(postWhere)
      .orderBy(desc(posts.createdAt))
      .limit(pageSize);

    const postIds = postRows.map((r) => r.id);

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
            and(
              inArray(postLikes.postId, postIds),
              eq(postLikes.userId, viewer.id),
            ),
          ),
      ]);

      likeCountMap = new Map(likeCounts.map((r) => [r.postId, Number(r.count)]));
      commentCountMap = new Map(commentCounts.map((r) => [r.postId, Number(r.count)]));
      viewerLikeSet = new Set(viewerLikes.map((r) => r.postId));
    }

    const items: ActivityItem[] = [];

    for (const r of postRows) {
      items.push({
        type: "post",
        id: `post-${r.id}`,
        body: r.body,
        imageUrl: r.imageUrl,
        isPinned: r.isPinned,
        createdAt: r.createdAt.toISOString(),
        likeCount: likeCountMap.get(r.id) ?? 0,
        commentCount: commentCountMap.get(r.id) ?? 0,
        viewerLiked: viewerLikeSet.has(r.id),
        user: { id: r.userId, name: r.userName, avatar: r.userAvatar },
      });
    }

    // ── Rounds ───────────────────────────────────────────────────
    // Only show rounds that were intentionally public to the group feed.
    // Private/invite-only rounds should not appear as generic group activity.
    const roundWhere = cursorDate
      ? and(
          eq(rounds.groupId, groupId),
          eq(rounds.visibility, "public"),
          lt(rounds.createdAt, cursorDate),
        )
      : and(eq(rounds.groupId, groupId), eq(rounds.visibility, "public"));

    const roundRows = await db
      .select({
        id: rounds.id,
        courseName: rounds.courseName,
        targetDate: rounds.targetDate,
        createdAt: rounds.createdAt,
        hostId: rounds.hostId,
        inviteToken: rounds.inviteToken,
        hostName: users.name,
        hostAvatar: users.avatar,
      })
      .from(rounds)
      .innerJoin(users, eq(users.id, rounds.hostId))
      .where(roundWhere)
      .orderBy(desc(rounds.createdAt))
      .limit(pageSize);

    for (const r of roundRows) {
      items.push({
        type: "round_created",
        id: `round-${r.id}`,
        roundId: r.id,
        roundToken: r.inviteToken,
        courseName: r.courseName,
        targetDate: r.targetDate.toISOString(),
        createdAt: r.createdAt.toISOString(),
        user: { id: r.hostId, name: r.hostName, avatar: r.hostAvatar },
      });
    }

    // ── Members ─────────────────────────────────────────────────
    const memberWhere = cursorDate
      ? and(eq(groupMembers.groupId, groupId), lt(groupMembers.joinedAt, cursorDate))
      : eq(groupMembers.groupId, groupId);

    const memberRows = await db
      .select({
        id: groupMembers.id,
        userId: groupMembers.userId,
        joinedAt: groupMembers.joinedAt,
        name: users.name,
        avatar: users.avatar,
      })
      .from(groupMembers)
      .innerJoin(users, eq(users.id, groupMembers.userId))
      .where(memberWhere)
      .orderBy(desc(groupMembers.joinedAt))
      .limit(pageSize);

    for (const r of memberRows) {
      items.push({
        type: "member_joined",
        id: `member-${r.id}`,
        joinedAt: r.joinedAt.toISOString(),
        user: { id: r.userId, name: r.name, avatar: r.avatar },
      });
    }

    // ── Score posts & sort ──────────────────────────────────────
    const followedIds = await getViewerFollowedIds(viewer.id);

    const scoredItems = items.map((item) => {
      if (item.type !== "post") return { item, _score: 0 };
      return {
        item,
        _score: scorePost({
          likeCount: item.likeCount,
          commentCount: item.commentCount,
          createdAt: item.createdAt,
          authorId: item.user.id,
          followedIds,
        }),
      };
    });

    scoredItems.sort((a, b) => {
      const pinA = a.item.type === "post" && a.item.isPinned ? 1 : 0;
      const pinB = b.item.type === "post" && b.item.isPinned ? 1 : 0;
      if (pinA !== pinB) return pinB - pinA;

      const bothPosts = a.item.type === "post" && b.item.type === "post";
      if (bothPosts && (a._score > 0 || b._score > 0)) {
        if (a._score !== b._score) return b._score - a._score;
      }

      const dateA = a.item.type === "member_joined" ? a.item.joinedAt : a.item.createdAt;
      const dateB = b.item.type === "member_joined" ? b.item.joinedAt : b.item.createdAt;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    items.length = 0;
    for (const s of scoredItems) items.push(s.item);

    const page = items.slice(0, pageSize);

    const oldestDate = page.length > 0
      ? (() => {
          const last = page[page.length - 1]!;
          return last.type === "member_joined" ? last.joinedAt : last.createdAt;
        })()
      : null;

    const hasMore = items.length > pageSize || (page.length === pageSize && page.length > 0);

    return NextResponse.json({
      activity: page,
      nextCursor: hasMore ? oldestDate : null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[GET /api/groups/[groupId]/activity]", error);
    return NextResponse.json({ error: "Unable to load activity." }, { status: 500 });
  }
}
