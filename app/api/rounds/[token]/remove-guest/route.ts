import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDbUser } from "@/lib/auth";
import { removeGuestFromRoundAsHost } from "@/lib/round-host-remove-guest";

const bodySchema = z.object({
  targetUserId: z.string().uuid(),
});

type RouteContext = {
  params: { token: string };
};

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const viewer = await requireDbUser(req);
    const token = params.token?.trim();
    if (!token) {
      return NextResponse.json({ error: "Token is required." }, { status: 400 });
    }

    const parsed = bodySchema.parse(await req.json());
    const result = await removeGuestFromRoundAsHost({
      inviteToken: token,
      hostUserId: viewer.id,
      targetUserId: parsed.targetUserId,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.statusCode });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid payload.", issues: error.flatten() },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST /api/rounds/[token]/remove-guest]", error);
    return NextResponse.json({ error: "Failed to remove player." }, { status: 500 });
  }
}
