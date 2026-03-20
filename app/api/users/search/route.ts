import { NextResponse } from "next/server";
import { and, ilike, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const currentUser = await requireDbUser(req);
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";

    if (q.length < 2) {
      return NextResponse.json({ users: [] });
    }

    const like = `%${q}%`;
    const found = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        avatar: users.avatar,
      })
      .from(users)
      .where(
        and(
          ne(users.id, currentUser.id),
          or(ilike(users.name, like), ilike(users.email, like)),
        ),
      )
      .limit(12);

    return NextResponse.json({ users: found });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to search users." }, { status: 500 });
  }
}
