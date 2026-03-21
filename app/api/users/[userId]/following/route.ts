import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { userFollows, users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { relationshipViewerToUser } from "@/lib/follow-relationship";
import { edgesViewerToUserIds } from "@/lib/viewer-follow-edges";

type RouteContext = { params: { userId: string } };

function handicapToString(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  return String(value);
}

export async function GET(req: Request, { params }: RouteContext) {
  try {
    const viewer = await requireDbUser(req);
    const targetUserId = params.userId;

    const [target] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!target) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        avatar: users.avatar,
        handicap: users.handicap,
      })
      .from(userFollows)
      .innerJoin(users, eq(users.id, userFollows.followedId))
      .where(
        and(eq(userFollows.followerId, targetUserId), eq(userFollows.status, "accepted")),
      );

    const byId = new Map<
      string,
      { id: string; name: string; avatar: string | null; handicap: string | null }
    >();
    for (const row of rows) {
      if (row.id === targetUserId) continue;
      if (byId.has(row.id)) continue;
      byId.set(row.id, {
        id: row.id,
        name: row.name,
        avatar: row.avatar,
        handicap: handicapToString(row.handicap ?? undefined),
      });
    }

    const list = Array.from(byId.values());
    const edgeMap = await edgesViewerToUserIds(
      viewer.id,
      list.map((u) => u.id),
    );

    const usersOut = list
      .map((u) => {
        const edges = edgeMap.get(u.id) ?? { outgoing: null, incoming: null };
        return {
          ...u,
          relationship: relationshipViewerToUser({
            viewerId: viewer.id,
            targetUserId: u.id,
            outgoingStatus: edges.outgoing,
            incomingStatus: edges.incoming,
          }),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ users: usersOut });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to load following." }, { status: 500 });
  }
}
