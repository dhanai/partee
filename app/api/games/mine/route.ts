import { NextResponse } from "next/server";
import { requireDbUser } from "@/lib/auth";
import { listSessionsForUser } from "@/lib/games/session-queries";

export async function GET(req: Request) {
  try {
    const user = await requireDbUser(req);
    const sessions = await listSessionsForUser(user.id, 50);
    return NextResponse.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        gameType: s.gameType,
        createdBy: s.createdBy,
        roundId: s.roundId,
        status: s.status,
        holesCount: s.holesCount,
        settings: s.settings,
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt?.toISOString() ?? null,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
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
