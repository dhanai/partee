import { NextResponse } from "next/server";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  conversations,
  conversationParticipants,
  groupMembers,
  groups,
} from "@/db/schema";
import { requireDbUser } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const viewer = await requireDbUser(req);

    const myGroupRows = await db
      .select({
        id: groups.id,
        name: groups.name,
        imageUrl: groups.imageUrl,
        myRole: groupMembers.role,
      })
      .from(groupMembers)
      .innerJoin(groups, eq(groups.id, groupMembers.groupId))
      .where(eq(groupMembers.userId, viewer.id))
      .orderBy(desc(groupMembers.joinedAt));

    const myGroupIds = myGroupRows.map((g) => g.id);

    const memberCounts = myGroupIds.length > 0
      ? await db
          .select({
            groupId: groupMembers.groupId,
            count: count().as("count"),
          })
          .from(groupMembers)
          .where(sql`${groupMembers.groupId} IN (${sql.join(myGroupIds.map((id) => sql`${id}`), sql`, `)})`)
          .groupBy(groupMembers.groupId)
      : [];

    const countMap = new Map(memberCounts.map((r) => [r.groupId, Number(r.count)]));

    const myGroups = myGroupRows.map((g) => ({
      id: g.id,
      name: g.name,
      imageUrl: g.imageUrl,
      memberCount: countMap.get(g.id) ?? 1,
      myRole: g.myRole,
    }));

    const discoverRows = await db
      .select({
        id: groups.id,
        name: groups.name,
        imageUrl: groups.imageUrl,
      })
      .from(groups)
      .where(
        and(
          eq(groups.joinPolicy, "public"),
          myGroupIds.length > 0
            ? sql`${groups.id} NOT IN (${sql.join(myGroupIds.map((id) => sql`${id}`), sql`, `)})`
            : sql`TRUE`,
        ),
      )
      .orderBy(desc(groups.createdAt))
      .limit(20);

    const discoverGroupIds = discoverRows.map((g) => g.id);
    const discoverCounts = discoverGroupIds.length > 0
      ? await db
          .select({
            groupId: groupMembers.groupId,
            count: count().as("count"),
          })
          .from(groupMembers)
          .where(sql`${groupMembers.groupId} IN (${sql.join(discoverGroupIds.map((id) => sql`${id}`), sql`, `)})`)
          .groupBy(groupMembers.groupId)
      : [];
    const discoverCountMap = new Map(discoverCounts.map((r) => [r.groupId, Number(r.count)]));

    const discoverGroups = discoverRows.map((g) => ({
      id: g.id,
      name: g.name,
      imageUrl: g.imageUrl,
      memberCount: discoverCountMap.get(g.id) ?? 0,
      myRole: null,
    }));

    return NextResponse.json({ myGroups, discoverGroups });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[GET /api/groups]", error);
    return NextResponse.json({ error: "Unable to load groups." }, { status: 500 });
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  imageUrl: z.string().url().optional(),
  joinPolicy: z.enum(["public", "approval", "invite_only"]).default("public"),
});

export async function POST(req: Request) {
  try {
    const viewer = await requireDbUser(req);
    const body = await req.json();
    const input = createSchema.parse(body);

    const [newGroup] = await db
      .insert(groups)
      .values({
        name: input.name,
        description: input.description ?? null,
        imageUrl: input.imageUrl ?? null,
        joinPolicy: input.joinPolicy,
        createdBy: viewer.id,
      })
      .returning();

    await db.insert(groupMembers).values({
      groupId: newGroup.id,
      userId: viewer.id,
      role: "owner",
    });

    const [conv] = await db
      .insert(conversations)
      .values({ type: "group", groupId: newGroup.id })
      .returning({ id: conversations.id });

    await db.insert(conversationParticipants).values({
      conversationId: conv.id,
      userId: viewer.id,
    });

    return NextResponse.json({
      group: {
        id: newGroup.id,
        name: newGroup.name,
        conversationId: conv.id,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input.", details: error.flatten() }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST /api/groups]", error);
    return NextResponse.json({ error: "Unable to create group." }, { status: 500 });
  }
}
