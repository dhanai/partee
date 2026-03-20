import { NextResponse } from "next/server";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
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

  const filters = [eq(rounds.visibility, "public")];

  if (date) {
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);
    filters.push(gte(rounds.teeTime, dayStart));
    filters.push(lte(rounds.teeTime, dayEnd));
  } else {
    filters.push(gte(rounds.teeTime, new Date()));
  }

  const rows = await db
    .select({
      id: rounds.id,
      inviteToken: rounds.inviteToken,
      courseName: rounds.courseName,
      customImageUrl: rounds.customImageUrl,
      courseMetadata: courses.metadata,
      teeTime: rounds.teeTime,
      totalSpots: rounds.totalSpots,
      joinPolicy: rounds.joinPolicy,
      hostName: users.name,
      lat: courses.lat,
      lng: courses.lng,
      confirmedCount:
        sql<number>`coalesce(sum(case when ${spots.status} = 'confirmed' then 1 else 0 end), 0)`.mapWith(
          Number,
        ),
    })
    .from(rounds)
    .innerJoin(users, eq(users.id, rounds.hostId))
    .innerJoin(courses, eq(courses.id, rounds.courseId))
    .leftJoin(spots, eq(spots.roundId, rounds.id))
    .where(and(...filters))
    .groupBy(rounds.id, users.name, courses.lat, courses.lng, courses.metadata)
    .orderBy(asc(rounds.teeTime));

  const withRemaining = rows
    .map((row) => {
      const rowLat = Number(row.lat);
      const rowLng = Number(row.lng);
      const distance =
        lat && lng ? haversineMiles(Number(lat), Number(lng), rowLat, rowLng) : null;
      const imageUrl = resolveRoundImageUrl({
        customImageUrl: row.customImageUrl,
        courseMetadata: row.courseMetadata,
      });
      return {
        id: row.id,
        inviteToken: row.inviteToken,
        courseName: row.courseName,
        teeTime: row.teeTime,
        totalSpots: row.totalSpots,
        joinPolicy: row.joinPolicy,
        hostName: row.hostName,
        lat: rowLat,
        lng: rowLng,
        distanceMiles: distance,
        spotsRemaining: Math.max(0, row.totalSpots - row.confirmedCount),
        imageUrl,
      };
    })
    .filter((row) => row.spotsRemaining > 0)
    .filter((row) =>
      row.distanceMiles === null ? true : row.distanceMiles <= distanceMiles,
    );

  return NextResponse.json({ rounds: withRemaining });
}
