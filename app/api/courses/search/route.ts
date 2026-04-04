import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getBiasCoordsFromProfileHomeCourse,
  searchGolfCourses,
  type GolfCourseSearchBias,
} from "@/lib/places";
import { db } from "@/db";
import { courses } from "@/db/schema";
import { ensureDbUser } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const bodySchema = z.object({
  query: z.string().min(2).max(120),
  latitude: z.number().gte(-90).lte(90).optional(),
  longitude: z.number().gte(-180).lte(180).optional(),
});

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { success } = rateLimit(ip, "course-search", 30, 60_000);
  if (!success) return rateLimitResponse();

  try {
    const body = bodySchema.parse(await req.json());

    let bias: GolfCourseSearchBias | undefined;
    const hasClientCoords =
      body.latitude !== undefined &&
      body.longitude !== undefined &&
      Number.isFinite(body.latitude) &&
      Number.isFinite(body.longitude);
    if (hasClientCoords) {
      bias = { lat: body.latitude!, lng: body.longitude! };
    } else {
      const user = await ensureDbUser(req);
      const home = user?.homeCourse?.trim();
      if (home) {
        const coords = await getBiasCoordsFromProfileHomeCourse(home);
        if (coords) {
          bias = { lat: coords.lat, lng: coords.lng };
        }
      }
    }

    const places = await searchGolfCourses(body.query, bias);

    if (places.length === 0) {
      return NextResponse.json({ courses: [] });
    }

    const cached = await Promise.all(
      places.map(async (course) => {
        const [upserted] = await db
          .insert(courses)
          .values({
            googlePlaceId: course.googlePlaceId,
            name: course.name,
            address: course.address,
            lat: course.lat.toString(),
            lng: course.lng.toString(),
            metadata: course.metadata,
          })
          .onConflictDoUpdate({
            target: courses.googlePlaceId,
            set: {
              name: course.name,
              address: course.address,
              lat: course.lat.toString(),
              lng: course.lng.toString(),
              metadata: course.metadata,
              cachedAt: new Date(),
            },
          })
          .returning();
        return upserted;
      }),
    );

    return NextResponse.json({ courses: cached });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid search payload", issues: error.flatten() },
        { status: 400 },
      );
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(
      { error: "Unable to search courses right now." },
      { status: 500 },
    );
  }
}
