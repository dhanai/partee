import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { userFollows, users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";

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
      return NextResponse.json({ ok: true, status: desiredStatus });
    }

    if (existing.status !== desiredStatus) {
      await db
        .update(userFollows)
        .set({ status: desiredStatus, updatedAt: new Date() })
        .where(eq(userFollows.id, existing.id));
    }

    return NextResponse.json({ ok: true, status: desiredStatus });
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

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to unfollow user." }, { status: 500 });
  }
}
