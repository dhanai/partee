import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { rounds, spots, users } from "@/db/schema";

type RouteContext = {
  params: { token: string };
};

export async function GET(_: Request, { params }: RouteContext) {
  const token = params.token;
  if (!token) {
    return NextResponse.json({ error: "Token is required." }, { status: 400 });
  }

  const [round] = await db
    .select({
      id: rounds.id,
      inviteToken: rounds.inviteToken,
      courseName: rounds.courseName,
      teeTime: rounds.teeTime,
      visibility: rounds.visibility,
      totalSpots: rounds.totalSpots,
      status: rounds.status,
      joinPolicy: rounds.joinPolicy,
      hostName: users.name,
      hostAvatar: users.avatar,
      confirmedCount:
        sql<number>`coalesce(sum(case when ${spots.status} = 'confirmed' then 1 else 0 end), 0)`.mapWith(
          Number,
        ),
    })
    .from(rounds)
    .leftJoin(users, eq(users.id, rounds.hostId))
    .leftJoin(spots, eq(spots.roundId, rounds.id))
    .where(eq(rounds.inviteToken, token))
    .groupBy(rounds.id, users.name, users.avatar);

  if (!round) {
    return NextResponse.json({ error: "Round not found." }, { status: 404 });
  }

  return NextResponse.json({
    round: {
      ...round,
      spotsRemaining: Math.max(0, round.totalSpots - round.confirmedCount),
    },
  });
}
