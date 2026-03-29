import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { groupJoinRequests, inAppNotifications, users } from "@/db/schema";
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

    const allActorIds = rows
      .map((r) => (r.data as { actorUserId?: string }).actorUserId)
      .filter((id): id is string => Boolean(id));
    const uniqueActorIds = [...new Set(allActorIds)];

    const actorProfileMap = new Map<string, { name: string; avatar: string | null }>();
    if (uniqueActorIds.length > 0) {
      const actorRows = await db
        .select({ id: users.id, name: users.name, avatar: users.avatar })
        .from(users)
        .where(inArray(users.id, uniqueActorIds));
      for (const a of actorRows) {
        actorProfileMap.set(a.id, { name: a.name, avatar: a.avatar });
      }
    }

    const groupJoinRows = rows.filter((r) => r.type === "group_join_request");
    const actorIdsForGroupJoins = groupJoinRows
      .map((r) => (r.data as { actorUserId?: string }).actorUserId)
      .filter((id): id is string => Boolean(id));

    const groupIds = groupJoinRows
      .map((r) => (r.data as { groupId?: string }).groupId)
      .filter((id): id is string => Boolean(id));

    const pendingRequestMap = new Map<string, { pending: boolean; requestId: string | null }>();
    if (groupIds.length > 0 && actorIdsForGroupJoins.length > 0) {
      const pendingRows = await db
        .select({
          id: groupJoinRequests.id,
          groupId: groupJoinRequests.groupId,
          userId: groupJoinRequests.userId,
          status: groupJoinRequests.status,
        })
        .from(groupJoinRequests)
        .where(
          and(
            inArray(groupJoinRequests.groupId, groupIds),
            inArray(groupJoinRequests.userId, actorIdsForGroupJoins),
          ),
        );
      for (const pr of pendingRows) {
        pendingRequestMap.set(`${pr.groupId}:${pr.userId}`, {
          pending: pr.status === "pending",
          requestId: pr.id,
        });
      }
    }

    const items = rows.flatMap((r) => {
      try {
        const d = r.data as {
          inviteToken?: string;
          groupId?: string;
          postId?: string;
          actorUserId?: string;
        };
        const inviteToken = typeof d.inviteToken === "string" ? d.inviteToken : "";
        const groupId = typeof d.groupId === "string" ? d.groupId : "";
        const postId = typeof d.postId === "string" ? d.postId : "";
        const actorUserId = typeof d.actorUserId === "string" ? d.actorUserId : "";

        const actorProfile = actorUserId ? actorProfileMap.get(actorUserId) : undefined;

        if (actorUserId && !actorProfile) return [];

        const requestEntry = groupId && actorUserId
          ? pendingRequestMap.get(`${groupId}:${actorUserId}`)
          : undefined;

        return [
          {
            id: r.id,
            type: r.type,
            title: r.title,
            body: r.body,
            inviteToken,
            groupId,
            postId,
            actorUserId,
            actorName: actorProfile?.name ?? "",
            actorAvatar: actorProfile?.avatar ?? null,
            stillPending: requestEntry?.pending ?? false,
            joinRequestId: requestEntry?.requestId ?? null,
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
