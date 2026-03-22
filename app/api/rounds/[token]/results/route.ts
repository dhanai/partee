import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { rounds, spots, users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { orderConfirmedPlayersHostFirstByClaimOrder } from "@/lib/confirmed-players-order";
import { buildRoundResultsPayload } from "@/lib/games/round-results-stats";

type RouteContext = { params: Promise<{ token: string }> };

async function viewerCanSeeRoundResults(roundId: string, userId: string): Promise<boolean> {
  const [round] = await db
    .select({ hostId: rounds.hostId })
    .from(rounds)
    .where(eq(rounds.id, roundId));
  if (!round) return false;
  if (round.hostId === userId) return true;
  const [spot] = await db
    .select({ id: spots.id })
    .from(spots)
    .where(and(eq(spots.roundId, roundId), eq(spots.userId, userId), eq(spots.status, "confirmed")));
  return Boolean(spot);
}

export async function GET(req: Request, context: RouteContext) {
  try {
    const user = await requireDbUser(req);
    const { token } = await context.params;
    if (!token?.trim()) {
      return NextResponse.json({ error: "Token is required." }, { status: 400 });
    }

    const [round] = await db
      .select({
        id: rounds.id,
        inviteToken: rounds.inviteToken,
        courseName: rounds.courseName,
        teeTime: rounds.teeTime,
        targetDate: rounds.targetDate,
        status: rounds.status,
        hostId: rounds.hostId,
        mode: rounds.mode,
      })
      .from(rounds)
      .where(eq(rounds.inviteToken, token.trim()));

    if (!round) {
      return NextResponse.json({ error: "Round not found." }, { status: 404 });
    }

    const allowed = await viewerCanSeeRoundResults(round.id, user.id);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const confirmedRows = await db
      .select({
        id: users.id,
        name: users.name,
        avatar: users.avatar,
        claimedAt: spots.createdAt,
      })
      .from(spots)
      .innerJoin(users, eq(users.id, spots.userId))
      .where(and(eq(spots.roundId, round.id), eq(spots.status, "confirmed")))
      .orderBy(asc(spots.createdAt));

    const ordered = orderConfirmedPlayersHostFirstByClaimOrder(confirmedRows, round.hostId);
    const roster = ordered.map((p) => ({
      userId: p.id,
      name: p.name,
      avatar: p.avatar,
      isGuest: false as const,
    }));

    const stats = await buildRoundResultsPayload(round.id, roster);

    return NextResponse.json({
      round: {
        id: round.id,
        inviteToken: round.inviteToken,
        courseName: round.courseName ?? "Course TBD",
        teeTime: round.teeTime?.toISOString() ?? null,
        targetDate: round.targetDate?.toISOString() ?? null,
        status: round.status,
        mode: round.mode,
      },
      ...stats,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json({ error: "Unable to load results." }, { status: 500 });
  }
}
