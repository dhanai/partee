import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { inAppNotifications } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";

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

    return NextResponse.json({
      items: rows.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        body: r.body,
        inviteToken: r.data.inviteToken,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to load notifications." }, { status: 500 });
  }
}
