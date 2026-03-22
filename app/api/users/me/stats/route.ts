import { NextResponse } from "next/server";
import { buildUserStats } from "@/lib/build-user-stats";
import { requireDbUser } from "@/lib/auth";
import { buildGroupedProfileStats } from "@/lib/user-stats-grouped";

export async function GET(req: Request) {
  try {
    const user = await requireDbUser(req);
    const stats = await buildUserStats(user.id);
    const grouped = buildGroupedProfileStats(stats);
    return NextResponse.json({ stats, grouped });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to load stats." }, { status: 500 });
  }
}
