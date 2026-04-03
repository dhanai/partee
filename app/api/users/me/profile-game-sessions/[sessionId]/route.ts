import { NextResponse } from "next/server";
import { z } from "zod";
import { patchProfileGameSessionSettings } from "@/lib/games/profile-game-session-settings";
import { requireDbUser } from "@/lib/auth";

type Ctx = { params: { sessionId: string } };

const patchSchema = z.object({
  isPinned: z.boolean().optional(),
  hideFromProfile: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const viewer = await requireDbUser(req);
    const sessionId = params.sessionId?.trim();
    if (!sessionId) {
      return NextResponse.json({ error: "Session id is required." }, { status: 400 });
    }

    const body = patchSchema.parse(await req.json());
    if (body.isPinned === undefined && body.hideFromProfile === undefined) {
      return NextResponse.json({ error: "No updates." }, { status: 400 });
    }

    await patchProfileGameSessionSettings({
      profileUserId: viewer.id,
      sessionId,
      viewerId: viewer.id,
      isPinned: body.isPinned,
      hideFromProfile: body.hideFromProfile,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[PATCH /api/users/me/profile-game-sessions/[sessionId]]", error);
    return NextResponse.json({ error: "Unable to update." }, { status: 500 });
  }
}
