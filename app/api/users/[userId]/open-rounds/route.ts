import { NextResponse } from "next/server";
import { ensureDbUser } from "@/lib/auth";
import { withPerfTimer } from "@/lib/profile-activity-perf";
import { getOpenRoundsForProfile } from "@/lib/user-profile-open-rounds";

type RouteContext = {
  params: { userId: string };
};

export async function GET(_req: Request, { params }: RouteContext) {
  const done = withPerfTimer("GET /api/users/[userId]/open-rounds");
  try {
    const viewer = await ensureDbUser();
    if (!viewer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const hostUserId = params.userId;
    if (!hostUserId) {
      return NextResponse.json({ error: "User id is required." }, { status: 400 });
    }

    const url = new URL(_req.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? "0");
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(100, Math.floor(limitRaw)) : undefined;
    const cursor = url.searchParams.get("cursor");
    const createdBefore = cursor ? new Date(cursor) : undefined;
    const orderByCreatedDesc = url.searchParams.get("orderByCreatedDesc") === "1";

    const rounds = await getOpenRoundsForProfile(hostUserId, viewer.id, {
      ...(limit ? { limit } : {}),
      ...(createdBefore ? { createdBefore } : {}),
      ...(orderByCreatedDesc ? { orderByCreatedDesc: true } : {}),
    });
    done({
      hostUserId,
      viewerUserId: viewer.id,
      hosting: rounds.hosting.length,
      joined: rounds.joined.length,
    });
    return NextResponse.json(rounds);
  } catch {
    done({
      hostUserId: params.userId,
      failed: true,
    });
    return NextResponse.json({ error: "Unable to load rounds." }, { status: 500 });
  }
}
