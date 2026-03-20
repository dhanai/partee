import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { courses, rounds, spots, users } from "@/db/schema";
import { ensureDbUser } from "@/lib/auth";
import { resolveRoundImageUrl } from "@/lib/round-images";

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
      customImageUrl: rounds.customImageUrl,
      courseMetadata: courses.metadata,
      hostId: rounds.hostId,
      hostName: users.name,
      hostAvatar: users.avatar,
      confirmedCount:
        sql<number>`coalesce(sum(case when ${spots.status} = 'confirmed' then 1 else 0 end), 0)`.mapWith(
          Number,
        ),
    })
    .from(rounds)
    .leftJoin(courses, eq(courses.id, rounds.courseId))
    .leftJoin(users, eq(users.id, rounds.hostId))
    .leftJoin(spots, eq(spots.roundId, rounds.id))
    .where(eq(rounds.inviteToken, token))
    .groupBy(rounds.id, users.name, users.avatar, courses.metadata);

  if (!round) {
    return NextResponse.json({ error: "Round not found." }, { status: 404 });
  }

  const currentUser = await ensureDbUser();
  let currentUserSpotStatus: string | null = null;
  if (currentUser) {
    const [existingSpot] = await db
      .select({ status: spots.status })
      .from(spots)
      .where(and(eq(spots.roundId, round.id), eq(spots.userId, currentUser.id)));
    currentUserSpotStatus = existingSpot?.status ?? null;
  }

  return NextResponse.json({
    round: {
      id: round.id,
      inviteToken: round.inviteToken,
      courseName: round.courseName,
      teeTime: round.teeTime,
      visibility: round.visibility,
      totalSpots: round.totalSpots,
      status: round.status,
      joinPolicy: round.joinPolicy,
      hostId: round.hostId,
      hostName: round.hostName,
      hostAvatar: round.hostAvatar,
      confirmedCount: round.confirmedCount,
      spotsRemaining: Math.max(0, round.totalSpots - round.confirmedCount),
      isHost: currentUser?.id === round.hostId,
      currentUserSpotStatus,
      imageUrl: resolveRoundImageUrl({
        customImageUrl: round.customImageUrl,
        courseMetadata: round.courseMetadata,
      }),
    },
  });
}
