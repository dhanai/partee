import { NextResponse } from "next/server";
import { z } from "zod";
import { searchGolfCourses } from "@/lib/places";
import { db } from "@/db";
import { courses } from "@/db/schema";

const bodySchema = z.object({
  query: z.string().min(2).max(120),
});

export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json());
    const places = await searchGolfCourses(body.query);

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
