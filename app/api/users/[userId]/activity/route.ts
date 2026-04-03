import { NextResponse } from "next/server";
import { and, count, desc, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { postComments, postLikes, posts, users } from "@/db/schema";
import { ensureDbUser } from "@/lib/auth";
import { withPerfTimer } from "@/lib/profile-activity-perf";
import {
  getCompletedGameActivityForProfile,
  type ProfileGameActivityJson,
} from "@/lib/games/profile-activity-games";
import {
  getOpenRoundsForProfile,
  type ProfileOpenRoundJson,
} from "@/lib/user-profile-open-rounds";

type RouteContext = {
  params: { userId: string };
};

type ProfilePostActivity = {
  kind: "post";
  createdAt: string;
  post: {
    id: string;
    body: string;
    imageUrl: string | null;
    imageUrls: string[];
    isPinned: boolean;
    groupId: string | null;
    scope: string;
    profileUserId: string | null;
    createdAt: string;
    likeCount: number;
    commentCount: number;
    viewerLiked: boolean;
    user: { id: string; name: string; avatar: string | null };
  };
};

type ProfileRoundActivity = {
  kind: "round";
  createdAt: string;
  round: ProfileOpenRoundJson & { source: "hosting" | "joined" };
};

type ProfileGameActivity = {
  kind: "game";
  createdAt: string;
  game: ProfileGameActivityJson;
};

export async function GET(req: Request, { params }: RouteContext) {
  const done = withPerfTimer("GET /api/users/[userId]/activity");
  try {
    const viewer = await ensureDbUser();
    if (!viewer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profileUserId = params.userId;
    if (!profileUserId) {
      return NextResponse.json({ error: "User id is required." }, { status: 400 });
    }

    const url = new URL(req.url);
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? "20")));
    const cursor = url.searchParams.get("cursor");
    const cursorDate = cursor ? new Date(cursor) : null;

    const postWhere = cursorDate
      ? and(
          eq(posts.scope, "profile"),
          eq(posts.hiddenOnProfile, false),
          eq(posts.profileUserId, profileUserId),
          lt(posts.createdAt, cursorDate),
        )
      : and(
          eq(posts.scope, "profile"),
          eq(posts.hiddenOnProfile, false),
          eq(posts.profileUserId, profileUserId),
        );

    const [postRows, openRounds, gameRows] = await Promise.all([
      db
        .select({
          id: posts.id,
          body: posts.body,
          imageUrl: posts.imageUrl,
          imageUrls: posts.imageUrls,
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
        .where(postWhere)
        .orderBy(desc(posts.createdAt))
        .limit(limit * 2),
      getOpenRoundsForProfile(profileUserId, viewer.id, {
        createdBefore: cursorDate ?? undefined,
        limit: limit * 2,
        orderByCreatedDesc: true,
      }),
      getCompletedGameActivityForProfile(profileUserId, {
        endedBefore: cursorDate ?? undefined,
        limit: limit * 2,
      }),
    ]);

    const postIds = postRows.map((row) => row.id);
    let likeCountMap = new Map<string, number>();
    let commentCountMap = new Map<string, number>();
    let viewerLikeSet = new Set<string>();

    if (postIds.length > 0) {
      const [likeCounts, commentCounts, viewerLikes] = await Promise.all([
        db
          .select({ postId: postLikes.postId, count: count() })
          .from(postLikes)
          .where(inArray(postLikes.postId, postIds))
          .groupBy(postLikes.postId),
        db
          .select({ postId: postComments.postId, count: count() })
          .from(postComments)
          .where(inArray(postComments.postId, postIds))
          .groupBy(postComments.postId),
        db
          .select({ postId: postLikes.postId })
          .from(postLikes)
          .where(and(inArray(postLikes.postId, postIds), eq(postLikes.userId, viewer.id))),
      ]);
      likeCountMap = new Map(likeCounts.map((row) => [row.postId, Number(row.count)]));
      commentCountMap = new Map(commentCounts.map((row) => [row.postId, Number(row.count)]));
      viewerLikeSet = new Set(viewerLikes.map((row) => row.postId));
    }

    const postItems: ProfilePostActivity[] = postRows.map((row) => ({
      kind: "post",
      createdAt: row.createdAt.toISOString(),
      post: {
        id: row.id,
        body: row.body,
        imageUrl: row.imageUrl,
        imageUrls: (row.imageUrls ?? []) as string[],
        isPinned: row.isPinned,
        groupId: row.groupId,
        scope: row.scope,
        profileUserId: row.profileUserId,
        createdAt: row.createdAt.toISOString(),
        likeCount: likeCountMap.get(row.id) ?? 0,
        commentCount: commentCountMap.get(row.id) ?? 0,
        viewerLiked: viewerLikeSet.has(row.id),
        user: { id: row.userId, name: row.userName, avatar: row.userAvatar },
      },
    }));

    const roundItems: ProfileRoundActivity[] = [
      ...openRounds.hosting.map((round) => ({
        kind: "round" as const,
        createdAt: round.createdAt,
        round: { ...round, source: "hosting" as const },
      })),
      ...openRounds.joined.map((round) => ({
        kind: "round" as const,
        createdAt: round.createdAt,
        round: { ...round, source: "joined" as const },
      })),
    ];

    const gameItems: ProfileGameActivity[] = gameRows.map((game) => ({
      kind: "game" as const,
      createdAt: game.endedAt,
      game,
    }));

    const merged = [...postItems, ...roundItems, ...gameItems].sort((a, b) => {
      const pinA =
        (a.kind === "post" && a.post.isPinned) || (a.kind === "game" && a.game.isPinned) ? 1 : 0;
      const pinB =
        (b.kind === "post" && b.post.isPinned) || (b.kind === "game" && b.game.isPinned) ? 1 : 0;
      if (pinA !== pinB) return pinB - pinA;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const page = merged.slice(0, limit);
    const nextCursor =
      merged.length > limit && page.length > 0 ? page[page.length - 1]!.createdAt : null;

    done({
      profileUserId,
      viewerUserId: viewer.id,
      limit,
      count: page.length,
      nextCursor,
    });

    return NextResponse.json({
      items: page,
      nextCursor,
    });
  } catch (error) {
    done({
      profileUserId: params.userId,
      failed: true,
    });
    console.error("[GET /api/users/[userId]/activity]", error);
    return NextResponse.json({ error: "Unable to load profile activity." }, { status: 500 });
  }
}
