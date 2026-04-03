import { NextResponse } from "next/server";
import { dismissGameSessionFromMyList } from "@/lib/games/dismiss-session-from-list";
import { requireDbUser } from "@/lib/auth";

type Ctx = { params: Promise<{ sessionId: string }> };

/** Remove session from the viewer's Games tab only; other players unchanged. */
export async function POST(req: Request, context: Ctx) {
  try {
    const user = await requireDbUser(req);
    const { sessionId } = await context.params;
    const id = sessionId?.trim();
    if (!id) {
      return NextResponse.json({ error: "Session id is required." }, { status: 400 });
    }
    const result = await dismissGameSessionFromMyList(id, user.id);
    if ("ok" in result) {
      return NextResponse.json({ ok: true as const });
    }
    return NextResponse.json({ error: result.error }, { status: result.status });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST /api/users/me/game-sessions/[sessionId]/dismiss]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
