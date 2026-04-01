import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { inAppNotifications } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";

type RouteContext = {
  params: { notificationId: string };
};

export async function DELETE(req: Request, { params }: RouteContext) {
  try {
    const viewer = await requireDbUser(req);
    const notificationId = params.notificationId?.trim();
    if (!notificationId) {
      return NextResponse.json({ error: "Notification id is required." }, { status: 400 });
    }

    await db
      .delete(inAppNotifications)
      .where(
        and(
          eq(inAppNotifications.id, notificationId),
          eq(inAppNotifications.recipientUserId, viewer.id),
        ),
      );

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[DELETE /api/users/me/activity-notifications/[notificationId]]", error);
    return NextResponse.json({ error: "Unable to remove notification." }, { status: 500 });
  }
}
