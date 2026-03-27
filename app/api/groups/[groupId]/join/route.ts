import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  conversationParticipants,
  conversations,
  groupJoinRequests,
  groupMembers,
  groups,
} from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { notifyGroupJoinRequest } from "@/lib/notify-user";
import { publishGroupActivityUpdated } from "@/lib/parfade-ably-publish";

type Ctx = { params: { groupId: string } };

export async function POST(req: Request, { params }: Ctx) {
  try {
    const viewer = await requireDbUser(req);
    const { groupId } = params;

    const [group] = await db
      .select({ joinPolicy: groups.joinPolicy, name: groups.name })
      .from(groups)
      .where(eq(groups.id, groupId))
      .limit(1);

    if (!group) {
      return NextResponse.json({ error: "Group not found." }, { status: 404 });
    }

    const [existing] = await db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(
        and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, viewer.id)),
      )
      .limit(1);

    if (existing) {
      return NextResponse.json({ status: "already_member" });
    }

    if (group.joinPolicy === "invite_only") {
      return NextResponse.json(
        { error: "This group is invite-only." },
        { status: 403 },
      );
    }

    if (group.joinPolicy === "approval") {
      await db
        .insert(groupJoinRequests)
        .values({ groupId, userId: viewer.id, status: "pending" })
        .onConflictDoNothing();

      await notifyGroupJoinRequest({
        groupId,
        groupName: group.name,
        requesterId: viewer.id,
        requesterName: viewer.name,
      }).catch((e) => console.error("[join] notifyGroupJoinRequest", e));

      return NextResponse.json({ status: "requested" });
    }

    await db.insert(groupMembers).values({
      groupId,
      userId: viewer.id,
      role: "member",
    });

    const [conv] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(eq(conversations.type, "group"), eq(conversations.groupId, groupId)),
      )
      .limit(1);

    if (conv) {
      await db
        .insert(conversationParticipants)
        .values({ conversationId: conv.id, userId: viewer.id })
        .onConflictDoNothing();
    }

    await publishGroupActivityUpdated(groupId, "member").catch((e) =>
      console.error("[join] group-activity ably", e),
    );

    return NextResponse.json({ status: "joined" });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST /api/groups/[groupId]/join]", error);
    return NextResponse.json({ error: "Unable to join group." }, { status: 500 });
  }
}
