import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { gameSessions } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { serializeGameSessionForApi, toIso } from "@/lib/games/serialize";
import { loadSessionWithPlayers, userIsGameParticipant } from "@/lib/games/session-queries";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: Request, context: RouteContext) {
  try {
    const user = await requireDbUser(req);
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
    }

    const allowed = await userIsGameParticipant(id, user.id);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const data = await loadSessionWithPlayers(id);
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      session: serializeGameSessionForApi(data.session),
      players: data.players.map((p) => ({
        userId: p.userId,
        sortOrder: p.sortOrder,
        teamId: p.teamId,
        name: p.name,
        avatar: p.avatar,
      })),
      holes: data.holes.map((h) => ({
        holeNumber: h.holeNumber,
        version: h.version,
        recordedBy: h.recordedBy,
        payload: h.payload,
        updatedAt: toIso(h.updatedAt),
      })),
    });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

const patchSchema = z.object({
  status: z.enum(["active", "completed", "abandoned"]),
});

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const user = await requireDbUser(req);
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
    }

    const allowed = await userIsGameParticipant(id, user.id);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = patchSchema.parse(await req.json());
    const now = new Date();
    const endedAt = body.status === "active" ? null : now;

    const [updated] = await db
      .update(gameSessions)
      .set({
        status: body.status,
        endedAt,
        updatedAt: now,
      })
      .where(eq(gameSessions.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ session: serializeGameSessionForApi(updated) });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid payload.", issues: e.flatten() },
        { status: 400 },
      );
    }
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
