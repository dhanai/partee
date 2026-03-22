import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { rounds } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { publishAfterRoundDetailChanged } from "@/lib/parfade-ably-publish";

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(req: Request, context: RouteContext) {
  try {
    const user = await requireDbUser(req);
    const { token } = await context.params;
    if (!token?.trim()) {
      return NextResponse.json({ error: "Token is required." }, { status: 400 });
    }

    const [round] = await db
      .select({
        id: rounds.id,
        hostId: rounds.hostId,
        status: rounds.status,
      })
      .from(rounds)
      .where(eq(rounds.inviteToken, token.trim()));

    if (!round) {
      return NextResponse.json({ error: "Round not found." }, { status: 404 });
    }
    if (round.hostId !== user.id) {
      return NextResponse.json({ error: "Only the host can mark the round complete." }, { status: 403 });
    }
    if (round.status === "completed") {
      return NextResponse.json({ error: "Round is already complete." }, { status: 400 });
    }

    await db
      .update(rounds)
      .set({ status: "completed" })
      .where(eq(rounds.id, round.id));

    publishAfterRoundDetailChanged(token.trim(), "complete");

    return NextResponse.json({ ok: true as const, status: "completed" as const });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json({ error: "Unable to complete round." }, { status: 500 });
  }
}
