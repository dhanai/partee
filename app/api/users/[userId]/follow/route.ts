import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { inAppNotifications, userFollows, users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { notifyFollowRequest } from "@/lib/notify-user";
import { publishNotificationBadgeNudge } from "@/lib/parfade-ably-publish";

type RouteContext = {
  params: { userId: string };
};

export async function POST(_req: Request, { params }: RouteContext) {
  try {
    const viewer = await requireDbUser(_req);
    const targetUserId = params.userId;
    if (viewer.id === targetUserId) {
      return NextResponse.json({ error: "You cannot follow yourself." }, { status: 400 });
    }

    const [target] = await db
      .select({ id: users.id, followVisibility: users.followVisibility })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!target) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const desiredStatus = target.followVisibility === "private" ? "requested" : "accepted";

    const [existing] = await db
      .select({ id: userFollows.id, status: userFollows.status })
      .from(userFollows)
      .where(and(eq(userFollows.followerId, viewer.id), eq(userFollows.followedId, targetUserId)))
      .limit(1);

    if (!existing) {
      await db.insert(userFollows).values({
        followerId: viewer.id,
        followedId: targetUserId,
        status: desiredStatus,
      });
      if (desiredStatus === "requested") {
        await notifyFollowRequest({ followedUserId: targetUserId, followerName: viewer.name });
      } else if (desiredStatus === "accepted") {
        await db.insert(inAppNotifications).values({
          recipientUserId: targetUserId,
          type: "new_follower",
          title: "New follower",
          body: `${viewer.name} started following you.`,
          data: { actorUserId: viewer.id },
        });
        publishNotificationBadgeNudge(targetUserId, "new-follower");
      }
      return NextResponse.json({ ok: true, status: desiredStatus });
    }

    // Never downgrade an established follow to "requested" when the target goes private.
    let nextStatus = existing.status;
    if (existing.status === "accepted") {
      nextStatus = "accepted";
    } else if (existing.status === "requested") {
      nextStatus = target.followVisibility === "public" ? "accepted" : "requested";
    }

    if (nextStatus !== existing.status) {
      await db
        .update(userFollows)
        .set({ status: nextStatus, updatedAt: new Date() })
        .where(eq(userFollows.id, existing.id));
    }

    return NextResponse.json({ ok: true, status: nextStatus });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to follow user." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  try {
    const viewer = await requireDbUser(_req);
    const targetUserId = params.userId;

    await db
      .delete(userFollows)
      .where(and(eq(userFollows.followerId, viewer.id), eq(userFollows.followedId, targetUserId)));

    await db
      .delete(inAppNotifications)
      .where(
        and(
          eq(inAppNotifications.recipientUserId, targetUserId),
          eq(inAppNotifications.type, "new_follower"),
          sql`${inAppNotifications.data}->>'actorUserId' = ${viewer.id}`,
        ),
      );

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to unfollow user." }, { status: 500 });
  }
}
