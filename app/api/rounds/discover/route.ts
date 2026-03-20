import { NextResponse } from "next/server";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { courses, rounds, spots, users } from "@/db/schema";
import { haversineMiles } from "@/lib/utils";
import { resolveRoundImageUrl } from "@/lib/round-images";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const distanceMiles = Number(searchParams.get("distanceMiles") ?? "9999");

  const now = new Date();
  const dayStart = date ? new Date(`${date}T00:00:00.000Z`) : null;
  const dayEnd = date ? new Date(`${date}T23:59:59.999Z`) : null;

  const rows = await db
    .select({
      id: rounds.id,
      inviteToken: rounds.inviteToken,
      mode: rounds.mode,
      preferredTimeWindow: rounds.preferredTimeWindow,
      courseName: rounds.courseName,
      customImageUrl: rounds.customImageUrl,
      courseMetadata: courses.metadata,
      teeTime: rounds.teeTime,
      targetDate: rounds.targetDate,
      totalSpots: rounds.totalSpots,
      joinPolicy: rounds.joinPolicy,
      hostName: users.name,
      hostAvatar: users.avatar,
      lat: courses.lat,
      lng: courses.lng,
      confirmedCount:
        sql<number>`coalesce(sum(case when ${spots.status} = 'confirmed' then 1 else 0 end), 0)`.mapWith(
          Number,
        ),
    })
    .from(rounds)
    .innerJoin(users, eq(users.id, rounds.hostId))
    .leftJoin(courses, eq(courses.id, rounds.courseId))
    .leftJoin(spots, eq(spots.roundId, rounds.id))
    .where(eq(rounds.visibility, "public"))
    .groupBy(
      rounds.id,
      users.name,
      users.avatar,
      courses.lat,
      courses.lng,
      courses.metadata,
    )
    .orderBy(asc(rounds.targetDate));

  const withRemaining = rows
    .map((row) => {
      const effectiveDate = row.teeTime ?? row.targetDate;
      const rowLat = row.lat ? Number(row.lat) : null;
      const rowLng = row.lng ? Number(row.lng) : null;
      const distance =
        lat && lng && rowLat !== null && rowLng !== null
          ? haversineMiles(Number(lat), Number(lng), rowLat, rowLng)
          : null;
      const imageUrl = resolveRoundImageUrl({
        customImageUrl: row.customImageUrl,
        courseMetadata: row.courseMetadata,
      });
      return {
        id: row.id,
        inviteToken: row.inviteToken,
        mode: row.mode,
        preferredTimeWindow: row.preferredTimeWindow,
        courseName: row.courseName ?? "Course TBD",
        teeTime: row.teeTime,
        targetDate: row.targetDate,
        effectiveDate,
        totalSpots: row.totalSpots,
        joinPolicy: row.joinPolicy,
        hostName: row.hostName,
        hostAvatar: row.hostAvatar,
        lat: rowLat,
        lng: rowLng,
        distanceMiles: distance,
        spotsRemaining: Math.max(0, row.totalSpots - row.confirmedCount),
        imageUrl,
      };
    })
    .filter((row) => {
      const when = new Date(row.effectiveDate);
      if (dayStart && dayEnd) {
        return when >= dayStart && when <= dayEnd;
      }
      return when >= now;
    })
    .filter((row) => row.spotsRemaining > 0)
    .filter((row) =>
      row.distanceMiles === null ? true : row.distanceMiles <= distanceMiles,
    );

  return NextResponse.json({ rounds: withRemaining });
}
