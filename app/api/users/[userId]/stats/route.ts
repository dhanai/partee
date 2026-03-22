import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { buildUserStats } from "@/lib/build-user-stats";
import { requireDbUser } from "@/lib/auth";
import { buildGroupedProfileStats } from "@/lib/user-stats-grouped";

type RouteContext = {
  params: { userId: string };
};

export async function GET(req: Request, { params }: RouteContext) {
  try {
    await requireDbUser(req);
    const rawId = params.userId;
    const parsed = z.string().uuid().safeParse(rawId);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
    }
    const targetId = parsed.data;

    const [exists] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, targetId))
      .limit(1);
    if (!exists) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const stats = await buildUserStats(targetId);
    const grouped = buildGroupedProfileStats(stats);
    return NextResponse.json({ stats, grouped });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to load stats." }, { status: 500 });
  }
}
