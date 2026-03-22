import { NextResponse } from "next/server";
import { requireDbUser } from "@/lib/auth";
import { missingGamesSchemaMessage, serializeGameSessionForApi } from "@/lib/games/serialize";
import { listSessionsForUser } from "@/lib/games/session-queries";

export async function GET(req: Request) {
  try {
    const user = await requireDbUser(req);
    const sessions = await listSessionsForUser(user.id, 50);
    const serialized: ReturnType<typeof serializeGameSessionForApi>[] = [];
    for (const s of sessions) {
      try {
        serialized.push(serializeGameSessionForApi(s));
      } catch (rowErr) {
        console.error("games/mine: skip row", s.id, rowErr);
      }
    }
    return NextResponse.json({ sessions: serialized });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const schemaHint = missingGamesSchemaMessage(e);
    if (schemaHint) {
      console.error(e);
      return NextResponse.json({ error: schemaHint }, { status: 503 });
    }
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
