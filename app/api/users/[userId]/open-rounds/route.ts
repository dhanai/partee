import { NextResponse } from "next/server";
import { ensureDbUser } from "@/lib/auth";
import { getHostedOpenRoundsForProfile } from "@/lib/user-profile-open-rounds";

type RouteContext = {
  params: { userId: string };
};

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    const viewer = await ensureDbUser();
    if (!viewer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const hostUserId = params.userId;
    if (!hostUserId) {
      return NextResponse.json({ error: "User id is required." }, { status: 400 });
    }

    const rounds = await getHostedOpenRoundsForProfile(hostUserId, viewer.id);
    return NextResponse.json({ rounds });
  } catch {
    return NextResponse.json({ error: "Unable to load rounds." }, { status: 500 });
  }
}
