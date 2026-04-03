import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDbUser } from "@/lib/auth";
import { hostResolveGuestJoinRequest } from "@/lib/round-host-resolve-guest-request";

const bodySchema = z.object({
  guestUserId: z.string().uuid(),
  action: z.enum(["accept", "decline"]),
});

type RouteContext = { params: { token: string } };

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const viewer = await requireDbUser(req);
    const token = params.token?.trim();
    if (!token) {
      return NextResponse.json({ error: "Token is required." }, { status: 400 });
    }

    const parsed = bodySchema.parse(await req.json());
    const result = await hostResolveGuestJoinRequest({
      inviteToken: token,
      hostUserId: viewer.id,
      guestUserId: parsed.guestUserId,
      action: parsed.action === "accept" ? "accept" : "decline",
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.statusCode });
    }

    return NextResponse.json({ ok: true, status: result.newStatus });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input.", issues: error.flatten() }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST /api/rounds/[token]/join-requests]", error);
    return NextResponse.json({ error: "Unable to update join request." }, { status: 500 });
  }
}
