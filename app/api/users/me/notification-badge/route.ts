import { NextResponse } from "next/server";
import { and, eq, inArray, max, ne } from "drizzle-orm";
import { db } from "@/db";
import { inAppNotifications, rounds, spots, userFollows, users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { timestampMs, toIsoTimestamp } from "@/lib/utils";

export async function GET(req: Request) {
  try {
    const viewer = await requireDbUser(req);

    const [userRow] = await db
      .select({ notificationsLastViewedAt: users.notificationsLastViewedAt })
      .from(users)
      .where(eq(users.id, viewer.id))
      .limit(1);

    const lastViewed = userRow?.notificationsLastViewedAt ?? null;

    const [followAgg] = await db
      .select({ latest: max(userFollows.createdAt) })
      .from(userFollows)
      .where(and(eq(userFollows.followedId, viewer.id), eq(userFollows.status, "requested")));

    const [spotAgg] = await db
      .select({ latest: max(spots.createdAt) })
      .from(spots)
      .innerJoin(rounds, eq(rounds.id, spots.roundId))
      .where(
        and(
          eq(spots.userId, viewer.id),
          ne(rounds.hostId, viewer.id),
          inArray(spots.status, ["invited", "requested"]),
        ),
      );

    const [activityAgg] = await db
      .select({ latest: max(inAppNotifications.createdAt) })
      .from(inAppNotifications)
      .where(eq(inAppNotifications.recipientUserId, viewer.id));

    const followLatest = followAgg?.latest ?? null;
    const spotLatest = spotAgg?.latest ?? null;
    const activityLatest = activityAgg?.latest ?? null;
    const msList = [followLatest, spotLatest, activityLatest]
      .map((t) => timestampMs(t))
      .filter((n): n is number => n != null);
    const maxMs = msList.length === 0 ? null : Math.max(...msList);

    const lastMs = timestampMs(lastViewed);
    let showBadge = false;
    if (maxMs != null) {
      if (lastMs == null) {
        showBadge = true;
      } else {
        showBadge = maxMs > lastMs;
      }
    }

    return NextResponse.json({
      showBadge,
      lastViewedAt: lastViewed != null ? toIsoTimestamp(lastViewed) : null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(error);
    return NextResponse.json({ error: "Unable to load notification badge." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const viewer = await requireDbUser(req);

    await db
      .update(users)
      .set({ notificationsLastViewedAt: new Date() })
      .where(eq(users.id, viewer.id));

    return NextResponse.json({ ok: true as const });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to update notification badge." }, { status: 500 });
  }
}
