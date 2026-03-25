import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  groupAnnouncements,
  groupMembers,
  rounds,
  users,
} from "@/db/schema";
import { requireDbUser } from "@/lib/auth";

type Ctx = { params: { groupId: string } };

type ActivityItem =
  | { type: "announcement"; id: string; body: string; isPinned: boolean; createdAt: string; user: { id: string; name: string; avatar: string | null } }
  | { type: "round_created"; id: string; roundId: string; courseName: string | null; targetDate: string; createdAt: string; user: { id: string; name: string; avatar: string | null } }
  | { type: "member_joined"; id: string; joinedAt: string; user: { id: string; name: string; avatar: string | null } };

export async function GET(req: Request, { params }: Ctx) {
  try {
    await requireDbUser(req);
    const { groupId } = params;

    const url = new URL(req.url);
    const limit = Math.min(50, Number(url.searchParams.get("limit") ?? "30"));

    const items: ActivityItem[] = [];

    const announcementRows = await db
      .select({
        id: groupAnnouncements.id,
        body: groupAnnouncements.body,
        isPinned: groupAnnouncements.isPinned,
        createdAt: groupAnnouncements.createdAt,
        userId: groupAnnouncements.userId,
        userName: users.name,
        userAvatar: users.avatar,
      })
      .from(groupAnnouncements)
      .innerJoin(users, eq(users.id, groupAnnouncements.userId))
      .where(eq(groupAnnouncements.groupId, groupId))
      .orderBy(desc(groupAnnouncements.createdAt))
      .limit(limit);

    for (const r of announcementRows) {
      items.push({
        type: "announcement",
        id: `ann-${r.id}`,
        body: r.body,
        isPinned: r.isPinned,
        createdAt: r.createdAt.toISOString(),
        user: { id: r.userId, name: r.userName, avatar: r.userAvatar },
      });
    }

    const roundRows = await db
      .select({
        id: rounds.id,
        courseName: rounds.courseName,
        targetDate: rounds.targetDate,
        createdAt: rounds.createdAt,
        hostId: rounds.hostId,
        inviteToken: rounds.inviteToken,
        hostName: users.name,
        hostAvatar: users.avatar,
      })
      .from(rounds)
      .innerJoin(users, eq(users.id, rounds.hostId))
      .where(eq(rounds.groupId, groupId))
      .orderBy(desc(rounds.createdAt))
      .limit(limit);

    for (const r of roundRows) {
      items.push({
        type: "round_created",
        id: `round-${r.id}`,
        roundId: r.id,
        courseName: r.courseName,
        targetDate: r.targetDate.toISOString(),
        createdAt: r.createdAt.toISOString(),
        user: { id: r.hostId, name: r.hostName, avatar: r.hostAvatar },
      });
    }

    const memberRows = await db
      .select({
        id: groupMembers.id,
        userId: groupMembers.userId,
        joinedAt: groupMembers.joinedAt,
        name: users.name,
        avatar: users.avatar,
      })
      .from(groupMembers)
      .innerJoin(users, eq(users.id, groupMembers.userId))
      .where(eq(groupMembers.groupId, groupId))
      .orderBy(desc(groupMembers.joinedAt))
      .limit(limit);

    for (const r of memberRows) {
      items.push({
        type: "member_joined",
        id: `member-${r.id}`,
        joinedAt: r.joinedAt.toISOString(),
        user: { id: r.userId, name: r.name, avatar: r.avatar },
      });
    }

    items.sort((a, b) => {
      const pinA = a.type === "announcement" && a.isPinned ? 1 : 0;
      const pinB = b.type === "announcement" && b.isPinned ? 1 : 0;
      if (pinA !== pinB) return pinB - pinA;

      const dateA = a.type === "member_joined" ? a.joinedAt : a.createdAt;
      const dateB = b.type === "member_joined" ? b.joinedAt : b.createdAt;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    return NextResponse.json({ activity: items.slice(0, limit) });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[GET /api/groups/[groupId]/activity]", error);
    return NextResponse.json({ error: "Unable to load activity." }, { status: 500 });
  }
}
