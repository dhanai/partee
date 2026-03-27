import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { userFollows } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { publishAfterProfileUpdated } from "@/lib/parfade-ably-publish";

const actionSchema = z.object({
  action: z.enum(["approve", "decline"]),
});

type RouteContext = {
  params: { followerId: string };
};

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const viewer = await requireDbUser(req);
    const parsed = actionSchema.parse(await req.json());

    const [existing] = await db
      .select({ id: userFollows.id })
      .from(userFollows)
      .where(
        and(
          eq(userFollows.followerId, params.followerId),
          eq(userFollows.followedId, viewer.id),
          eq(userFollows.status, "requested"),
        ),
      )
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Follow request not found." }, { status: 404 });
    }

    if (parsed.action === "approve") {
      await db
        .update(userFollows)
        .set({ status: "accepted", updatedAt: new Date() })
        .where(eq(userFollows.id, existing.id));
      await publishAfterProfileUpdated(viewer.id);
      return NextResponse.json({ ok: true, status: "accepted" });
    }

    await db.delete(userFollows).where(eq(userFollows.id, existing.id));
    await publishAfterProfileUpdated(viewer.id);
    return NextResponse.json({ ok: true, status: "declined" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid follow request action.", issues: error.flatten() },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to update follow request." }, { status: 500 });
  }
}
