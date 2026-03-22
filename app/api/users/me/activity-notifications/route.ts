import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { inAppNotifications } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { toIsoTimestamp } from "@/lib/utils";

const LIMIT = 50;

export async function GET(req: Request) {
  try {
    const viewer = await requireDbUser(req);

    const rows = await db
      .select({
        id: inAppNotifications.id,
        type: inAppNotifications.type,
        title: inAppNotifications.title,
        body: inAppNotifications.body,
        data: inAppNotifications.data,
        createdAt: inAppNotifications.createdAt,
      })
      .from(inAppNotifications)
      .where(eq(inAppNotifications.recipientUserId, viewer.id))
      .orderBy(desc(inAppNotifications.createdAt))
      .limit(LIMIT);

    const items = rows.flatMap((r) => {
      try {
        const rawToken = (r.data as { inviteToken?: unknown }).inviteToken;
        const inviteToken = typeof rawToken === "string" ? rawToken : "";
        return [
          {
            id: r.id,
            type: r.type,
            title: r.title,
            body: r.body,
            inviteToken,
            createdAt: toIsoTimestamp(r.createdAt),
          },
        ];
      } catch (rowErr) {
        console.error("activity-notifications: skip row", r.id, rowErr);
        return [];
      }
    });

    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const msg = error instanceof Error ? error.message : String(error);
    if (/in_app_notifications/i.test(msg) && /does not exist/i.test(msg)) {
      console.error("in_app_notifications table missing; returning empty feed", error);
      return NextResponse.json({ items: [] });
    }
    console.error(error);
    return NextResponse.json({ error: "Unable to load notifications." }, { status: 500 });
  }
}
