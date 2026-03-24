import { desc, ilike, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { rounds, users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { isUserAdmin } from "@/lib/require-admin";

function forbidden(msg: string) {
  return NextResponse.json({ error: msg }, { status: 403 });
}

export async function GET(req: Request) {
  try {
    const currentUser = await requireDbUser(req);
    if (!isUserAdmin(currentUser)) return forbidden("Not authorized.");

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const limitRaw = Number(searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.round(limitRaw))) : 50;
    const like = `%${q}%`;

    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        avatar: users.avatar,
        createdAt: users.createdAt,
        followVisibility: users.followVisibility,
        hideHostedRoundsFromDiscover: users.hideHostedRoundsFromDiscover,
        isAdmin: users.isAdmin,
        hasPushToken: sql<boolean>`(${users.expoPushToken} is not null and ${users.expoPushToken} <> '')`,
        hostedRoundsCount: sql<number>`count(${rounds.id})::int`,
      })
      .from(users)
      .leftJoin(rounds, sql`${rounds.hostId} = ${users.id}`)
      .where(q.length > 0 ? or(ilike(users.name, like), ilike(users.email, like)) : undefined)
      .groupBy(users.id)
      .orderBy(desc(users.createdAt))
      .limit(limit);

    return NextResponse.json({ users: rows, currentUserId: currentUser.id });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[GET /api/admin/users]", error);
    return NextResponse.json({ error: "Unable to load users." }, { status: 500 });
  }
}
