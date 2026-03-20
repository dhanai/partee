import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { courses, rounds } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";

const finalizeSchema = z.object({
  courseId: z.string().uuid(),
  teeTime: z.string().datetime(),
});

type RouteContext = {
  params: { token: string };
};

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const user = await requireDbUser(req);
    const parsed = finalizeSchema.parse(await req.json());

    const [round] = await db
      .select({
        id: rounds.id,
        hostId: rounds.hostId,
        mode: rounds.mode,
      })
      .from(rounds)
      .where(eq(rounds.inviteToken, params.token));

    if (!round) {
      return NextResponse.json({ error: "Round not found." }, { status: 404 });
    }

    if (round.hostId !== user.id) {
      return NextResponse.json({ error: "Only host can finalize." }, { status: 403 });
    }

    if (round.mode !== "planning") {
      return NextResponse.json(
        { error: "Round is already finalized." },
        { status: 400 },
      );
    }

    const teeTime = new Date(parsed.teeTime);
    if (teeTime.getTime() < Date.now()) {
      return NextResponse.json(
        { error: "Tee time must be in the future." },
        { status: 400 },
      );
    }

    const [course] = await db
      .select({
        id: courses.id,
        name: courses.name,
      })
      .from(courses)
      .where(eq(courses.id, parsed.courseId));

    if (!course) {
      return NextResponse.json({ error: "Course not found." }, { status: 404 });
    }

    const [updated] = await db
      .update(rounds)
      .set({
        mode: "scheduled",
        courseId: course.id,
        courseName: course.name,
        teeTime,
        targetDate: teeTime,
        preferredTimeWindow: null,
        planningLocation: null,
      })
      .where(and(eq(rounds.id, round.id), eq(rounds.hostId, user.id)))
      .returning({
        id: rounds.id,
        mode: rounds.mode,
        courseName: rounds.courseName,
        teeTime: rounds.teeTime,
        targetDate: rounds.targetDate,
      });

    return NextResponse.json({ round: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid finalize payload.", issues: error.flatten() },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to finalize round." }, { status: 500 });
  }
}
