import { NextResponse } from "next/server";
import { requireDbUser } from "@/lib/auth";
import { deleteGameSessionIfAllowed } from "@/lib/games/delete-session";

type RouteContext = { params: Promise<{ id: string }> };

/** POST fallback: some stacks (e.g. Apache in front of Node) return 405 for DELETE. */
export async function POST(_req: Request, context: RouteContext) {
  try {
    const user = await requireDbUser(_req);
    const { id } = await context.params;
    const result = await deleteGameSessionIfAllowed(id, user.id);
    if ("ok" in result) {
      return NextResponse.json({ ok: true as const });
    }
    return NextResponse.json({ error: result.error }, { status: result.status });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
