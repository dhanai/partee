import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { courses, rounds, spots, users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { resolveRoundImageUrl } from "@/lib/round-images";

const createRoundSchema = z
  .object({
    planningMode: z.boolean().default(false),
    preferredTimeWindow: z.enum(["morning", "afternoon", "twilight"]).optional(),
    courseId: z.string().uuid().optional(),
    teeTime: z.string().datetime().optional(),
    targetDate: z.string().datetime().optional(),
    totalSpots: z.number().int().min(2).max(4),
    visibility: z.enum(["private", "public"]),
    joinPolicy: z.enum(["instant", "approval"]).default("instant"),
    customImageUrl: z
      .string()
      .trim()
      .max(2048)
      .refine(
        (value) =>
          value.length === 0 ||
          value.startsWith("/") ||
          /^https?:\/\/.+/i.test(value),
        {
          message: "customImageUrl must be a valid URL or app-relative path.",
        },
      )
      .optional()
      .nullable(),
    inviteeUserIds: z.array(z.string().uuid()).max(30).default([]),
  })
  .superRefine((payload, ctx) => {
    if (payload.planningMode) {
      if (!payload.targetDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["targetDate"],
          message: "Target date is required for planning rounds.",
        });
      }
      return;
    }
    if (payload.preferredTimeWindow) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["preferredTimeWindow"],
        message: "preferredTimeWindow is only valid for planning rounds.",
      });
    }

    if (!payload.courseId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["courseId"],
        message: "Course is required for scheduled rounds.",
      });
    }
    if (!payload.teeTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["teeTime"],
        message: "Tee time is required for scheduled rounds.",
      });
    }
  });

export async function POST(req: Request) {
  try {
    const user = await requireDbUser(req);
    const parsed = createRoundSchema.parse(await req.json());
    const now = Date.now();
    let teeTime: Date | null = null;
    let targetDate: Date;
    let course: typeof courses.$inferSelect | null = null;

    if (parsed.planningMode) {
      targetDate = new Date(parsed.targetDate as string);
      if (targetDate.getTime() < now) {
        return NextResponse.json(
          { error: "Target date must be in the future." },
          { status: 400 },
        );
      }
    } else {
      teeTime = new Date(parsed.teeTime as string);
      if (teeTime.getTime() < now) {
        return NextResponse.json(
          { error: "Tee time must be in the future." },
          { status: 400 },
        );
      }

      const [selectedCourse] = await db
        .select()
        .from(courses)
        .where(eq(courses.id, parsed.courseId as string));
      if (!selectedCourse) {
        return NextResponse.json({ error: "Course not found." }, { status: 404 });
      }
      course = selectedCourse;
      targetDate = teeTime;
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
          mode: parsed.planningMode ? "planning" : "scheduled",
          courseId: course?.id ?? null,
          courseName: course?.name ?? null,
          teeTime,
          targetDate,
          preferredTimeWindow: parsed.planningMode
            ? (parsed.preferredTimeWindow ?? null)
            : null,
          totalSpots: parsed.totalSpots,
          visibility: parsed.visibility,
          joinPolicy: parsed.joinPolicy,
          customImageUrl:
            parsed.customImageUrl && parsed.customImageUrl.trim().length > 0
              ? parsed.customImageUrl.trim()
              : null,
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
    const message =
      error instanceof Error ? error.message : "Failed to create round.";
    console.error("[POST /api/rounds]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    await requireDbUser(req);
    const now = new Date();

    const upcoming = await db
      .select({
        id: rounds.id,
        mode: rounds.mode,
        preferredTimeWindow: rounds.preferredTimeWindow,
        courseName: rounds.courseName,
        targetDate: rounds.targetDate,
        customImageUrl: rounds.customImageUrl,
        courseMetadata: courses.metadata,
        teeTime: rounds.teeTime,
        visibility: rounds.visibility,
        totalSpots: rounds.totalSpots,
        confirmedCount:
          sql<number>`coalesce(sum(case when ${spots.status} = 'confirmed' then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
      })
      .from(rounds)
      .leftJoin(courses, eq(courses.id, rounds.courseId))
      .leftJoin(spots, eq(spots.roundId, rounds.id))
      .groupBy(rounds.id, courses.metadata)
      .orderBy(rounds.targetDate);

    return NextResponse.json({
      rounds: upcoming
        .map((round) => {
          const effectiveDate = round.teeTime ?? round.targetDate;
          return {
            id: round.id,
            mode: round.mode,
            preferredTimeWindow: round.preferredTimeWindow,
            courseName: round.courseName ?? "Course TBD",
            targetDate: round.targetDate,
            teeTime: round.teeTime,
            visibility: round.visibility,
            totalSpots: round.totalSpots,
            confirmedCount: round.confirmedCount,
            effectiveDate,
            imageUrl: resolveRoundImageUrl({
              customImageUrl: round.customImageUrl,
              courseMetadata: round.courseMetadata,
            }),
          };
        })
        .filter((round) => new Date(round.effectiveDate) >= now)
        .map((round) => ({
        id: round.id,
        mode: round.mode,
        preferredTimeWindow: round.preferredTimeWindow,
        courseName: round.courseName,
        targetDate: round.targetDate,
        teeTime: round.teeTime,
        visibility: round.visibility,
        totalSpots: round.totalSpots,
        confirmedCount: round.confirmedCount,
        imageUrl: round.imageUrl,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to fetch rounds." }, { status: 500 });
  }
}
