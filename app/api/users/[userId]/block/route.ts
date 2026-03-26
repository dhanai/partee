import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { userBlocks } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";

type RouteContext = {
  params: { userId: string };
};

export async function POST(_req: Request, { params }: RouteContext) {
  try {
    const viewer = await requireDbUser(_req);
    const blockedId = params.userId;

    if (viewer.id === blockedId) {
      return NextResponse.json({ error: "You cannot block yourself." }, { status: 400 });
    }

    try {
      await db.insert(userBlocks).values({
        blockerId: viewer.id,
        blockedId,
      });
    } catch (err: unknown) {
      const isUniqueViolation =
        err instanceof Error && "code" in err && (err as { code: string }).code === "23505";
      if (!isUniqueViolation) throw err;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to block user." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  try {
    const viewer = await requireDbUser(_req);
    const blockedId = params.userId;

    await db
      .delete(userBlocks)
      .where(and(eq(userBlocks.blockerId, viewer.id), eq(userBlocks.blockedId, blockedId)));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to unblock user." }, { status: 500 });
  }
}
