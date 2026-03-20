import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { courses, rounds, spots, users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";

const createRoundSchema = z.object({
  courseId: z.string().uuid(),
  teeTime: z.string().datetime(),
  totalSpots: z.number().int().min(2).max(4),
  visibility: z.enum(["private", "public"]),
  joinPolicy: z.enum(["instant", "approval"]).default("instant"),
  inviteeUserIds: z.array(z.string().uuid()).max(30).default([]),
});

export async function POST(req: Request) {
  try {
    const user = await requireDbUser();
    const parsed = createRoundSchema.parse(await req.json());
    const teeTime = new Date(parsed.teeTime);

    if (teeTime.getTime() < Date.now()) {
      return NextResponse.json(
        { error: "Tee time must be in the future." },
        { status: 400 },
      );
    }

    const [course] = await db
      .select()
      .from(courses)
      .where(eq(courses.id, parsed.courseId));

    if (!course) {
      return NextResponse.json({ error: "Course not found." }, { status: 404 });
    }

    const dedupedInviteeIds = [
      ...new Set(parsed.inviteeUserIds.filter((id) => id !== user.id)),
    ];

    let invitedCount = 0;
    const [createdRound] = await db.transaction(async (tx) => {
      const [newRound] = await tx
        .insert(rounds)
        .values({
          hostId: user.id,
          courseId: course.id,
          courseName: course.name,
          teeTime,
          totalSpots: parsed.totalSpots,
          visibility: parsed.visibility,
          joinPolicy: parsed.joinPolicy,
          status: "forming",
          inviteToken: nanoid(12),
        })
        .returning();

      await tx.insert(spots).values({
        roundId: newRound.id,
        userId: user.id,
        status: "confirmed",
      });

      if (dedupedInviteeIds.length > 0) {
        const validInvitees = await tx
          .select({ id: users.id })
          .from(users)
          .where(inArray(users.id, dedupedInviteeIds));

        const inviteRows = validInvitees.map((invitee) => ({
          roundId: newRound.id,
          userId: invitee.id,
          status: "invited" as const,
        }));
        invitedCount = inviteRows.length;

        if (inviteRows.length > 0) {
          await tx
            .insert(spots)
            .values(inviteRows)
            .onConflictDoNothing({
              target: [spots.roundId, spots.userId],
            });
        }
      }

      return [newRound];
    });

    return NextResponse.json({
      round: createdRound,
      invitePath: `/round/${createdRound.inviteToken}`,
      invitedCount,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid round payload.", issues: error.flatten() },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to create round." },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    await requireDbUser();
    const now = new Date();

    const upcoming = await db
      .select({
        id: rounds.id,
        courseName: rounds.courseName,
        teeTime: rounds.teeTime,
        visibility: rounds.visibility,
        totalSpots: rounds.totalSpots,
        confirmedCount:
          sql<number>`coalesce(sum(case when ${spots.status} = 'confirmed' then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
      })
      .from(rounds)
      .leftJoin(spots, eq(spots.roundId, rounds.id))
      .where(gte(rounds.teeTime, now))
      .groupBy(rounds.id)
      .orderBy(rounds.teeTime);

    return NextResponse.json({ rounds: upcoming });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to fetch rounds." }, { status: 500 });
  }
}
