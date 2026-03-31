import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { conversationParticipants, conversations, courses, groupMembers, rounds, spots, users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { resolveValidatedUsLocationLabel } from "@/lib/places";
import { notifyRoundInvites } from "@/lib/notify-user";
import {
  publishAfterRoundCreated,
  publishGroupActivityUpdated,
  publishRoundInviteToast,
} from "@/lib/parfade-ably-publish";
import { buildRoundInvitePushBody, formatChatPushTitleLine } from "@/lib/round-invite-push-message";
import { resolveRoundImageUrl } from "@/lib/round-images";
import {
  getRoundsDbCapabilities,
  roundInsertReturningFields,
} from "@/lib/rounds-db-capabilities";
import { textArraySql, timeWindowResponseFields } from "@/lib/round-time-window-compat";

const createRoundSchema = z
  .object({
    planningMode: z.boolean().default(false),
    /** When true, same fields as scheduled (course + tee) but `mode` is `tournament` and up to 200 spots. */
    tournamentMode: z.boolean().default(false),
    preferredTimeWindow: z.preprocess(
      (val) => (typeof val === "string" ? [val] : val),
      z.array(z.enum(["morning", "afternoon", "twilight"])).max(3),
    ).optional().nullable(),
    planningLocation: z.string().trim().min(2).max(80).optional().nullable(),
    courseId: z.string().uuid().optional().nullable(),
    teeTime: z.string().datetime().optional().nullable(),
    targetDate: z.string().datetime().optional().nullable(),
    totalSpots: z.preprocess(
      (v) => (typeof v === "string" ? Number(v) : v),
      z.number().int().min(2).max(200),
    ),
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
    groupId: z.string().uuid().optional().nullable(),
    tournamentTitle: z.string().trim().max(120).optional().nullable(),
    tournamentDetails: z.string().max(8000).optional().nullable(),
  })
  .superRefine((payload, ctx) => {
    if (payload.planningMode && payload.tournamentMode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tournamentMode"],
        message: "Cannot combine planning and tournament.",
      });
    }
    if (!payload.tournamentMode && (payload.tournamentTitle || payload.tournamentDetails)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tournamentTitle"],
        message: "Tournament title and details are only allowed for tournament rounds.",
      });
    }
    if (payload.planningMode) {
      if (payload.totalSpots > 4) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["totalSpots"],
          message: "Planning rounds support at most 4 total spots.",
        });
      }
      if (!payload.targetDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["targetDate"],
          message: "Target date is required for planning rounds.",
        });
      }
      if (!payload.planningLocation) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["planningLocation"],
          message: "Planning location is required for planning rounds.",
        });
      }
      return;
    }
    if (payload.tournamentMode) {
      if (payload.totalSpots > 200) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["totalSpots"],
          message: "Tournament max participants cannot exceed 200.",
        });
      }
    } else if (payload.totalSpots > 4) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["totalSpots"],
        message: "Scheduled rounds support at most 4 total spots.",
      });
    }
    if (payload.preferredTimeWindow && payload.preferredTimeWindow.length > 0 && !payload.planningMode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["preferredTimeWindow"],
        message: "preferredTimeWindow is only valid for planning rounds.",
      });
    }
    if (payload.planningLocation && !payload.planningMode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["planningLocation"],
        message: "planningLocation is only valid for planning rounds.",
      });
    }

    if (payload.tournamentMode) {
      if (!payload.courseId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["courseId"],
          message: "Course is required for tournament rounds.",
        });
      }
      if (!payload.teeTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["teeTime"],
          message: "Tee time is required for tournament rounds.",
        });
      }
      return;
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
  let rawBody: unknown;
  try {
    const user = await requireDbUser(req);
    rawBody = await req.json();
    const parsed = createRoundSchema.parse(rawBody);
    const dbCap = await getRoundsDbCapabilities();
    if (parsed.tournamentMode && !dbCap.hasTournamentModeEnum) {
      return NextResponse.json(
        {
          error:
            "Tournament rounds are not available on this server yet. Please run database migrations (or contact support).",
        },
        { status: 503 },
      );
    }
    if (parsed.tournamentMode && !dbCap.hasTournamentCopyColumns) {
      return NextResponse.json(
        {
          error:
            "Tournament title/details require a database migration. Run migrations or contact support.",
        },
        { status: 503 },
      );
    }
    const roundMode: "planning" | "scheduled" | "tournament" = parsed.planningMode
      ? "planning"
      : parsed.tournamentMode
        ? "tournament"
        : "scheduled";
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

      const canonicalPlanningLocation = await resolveValidatedUsLocationLabel(
        parsed.planningLocation ?? "",
      );
      if (!canonicalPlanningLocation) {
        return NextResponse.json(
          {
            error:
              "Planning location must be a valid US City, ST selected from suggestions.",
          },
          { status: 400 },
        );
      }
      parsed.planningLocation = canonicalPlanningLocation;
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

    const dedupedDirectInviteeIds = [
      ...new Set(parsed.inviteeUserIds.filter((id) => id !== user.id)),
    ];
    let groupMemberInviteeIds: string[] = [];

    if (parsed.groupId) {
      const groupMemberRows = await db
        .select({ userId: groupMembers.userId })
        .from(groupMembers)
        .where(eq(groupMembers.groupId, parsed.groupId));

      const viewerIsMember = groupMemberRows.some((row) => row.userId === user.id);
      if (!viewerIsMember) {
        return NextResponse.json(
          { error: "You must be a group member to post a round to that group." },
          { status: 403 },
        );
      }

      groupMemberInviteeIds = groupMemberRows
        .map((row) => row.userId)
        .filter((id) => id !== user.id);
    }

    const dedupedInviteeIds = [
      ...new Set([...dedupedDirectInviteeIds, ...groupMemberInviteeIds]),
    ];

    let invitedCount = 0;
    const [createdRound] = await db.transaction(async (tx) => {
      /**
       * Omit tournament fields from INSERT when not in tournament mode. Use an explicit
       * `returning(...)` list when `tournament_*` columns are missing: Drizzle’s default
       * `returning()` includes every table column, so Postgres would error on RETURNING
       * even if INSERT did not reference those columns — which broke scheduled/planning.
       */
      const [newRound] = await tx
        .insert(rounds)
        .values({
          hostId: user.id,
          mode: roundMode,
          courseId: course?.id ?? null,
          courseName: course?.name ?? null,
          teeTime,
          targetDate,
          preferredTimeWindow: parsed.planningMode
            ? textArraySql(parsed.preferredTimeWindow?.length ? parsed.preferredTimeWindow : null)
            : null,
          planningLocation: parsed.planningMode
            ? (parsed.planningLocation?.trim() ?? null)
            : null,
          totalSpots: parsed.totalSpots,
          visibility: parsed.visibility,
          joinPolicy: parsed.joinPolicy,
          customImageUrl:
            parsed.customImageUrl && parsed.customImageUrl.trim().length > 0
              ? parsed.customImageUrl.trim()
              : null,
          groupId: parsed.groupId ?? null,
          status: "forming",
          inviteToken: nanoid(12),
          ...(parsed.tournamentMode
            ? {
                tournamentTitle: parsed.tournamentTitle?.trim()
                  ? parsed.tournamentTitle.trim()
                  : null,
                tournamentDetails: parsed.tournamentDetails?.trim()
                  ? parsed.tournamentDetails.trim()
                  : null,
              }
            : {}),
        })
        .returning(roundInsertReturningFields(dbCap.hasTournamentCopyColumns));

      await tx.insert(spots).values({
        roundId: newRound.id,
        userId: user.id,
        status: "confirmed",
      });

      const [conv] = await tx
        .insert(conversations)
        .values({ type: "round", roundId: newRound.id })
        .returning({ id: conversations.id });
      await tx
        .insert(conversationParticipants)
        .values({ conversationId: conv.id, userId: user.id });

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

    let inviteeUserIds: string[] = [];
    if (invitedCount > 0) {
      const invitedRows = await db
        .select({ userId: spots.userId })
        .from(spots)
        .where(and(eq(spots.roundId, createdRound.id), eq(spots.status, "invited")));
      inviteeUserIds = invitedRows.map((r) => r.userId);
      await notifyRoundInvites({
        inviteToken: createdRound.inviteToken,
        inviteeUserIds,
        body: buildRoundInvitePushBody({
          inviterDisplayName: user.name,
          teeTime: createdRound.teeTime,
          targetDate: createdRound.targetDate,
          mode: createdRound.mode,
          courseName: createdRound.courseName,
          planningLocation: createdRound.planningLocation,
        }),
      });

      const roundTitle = formatChatPushTitleLine({
        courseName: createdRound.courseName,
        planningLocation: createdRound.planningLocation,
        mode: createdRound.mode,
        teeTime: createdRound.teeTime,
        targetDate: createdRound.targetDate,
      });
      await Promise.all(
        inviteeUserIds.map((uid) =>
          publishRoundInviteToast({
            inviteeUserId: uid,
            inviteToken: createdRound.inviteToken,
            roundTitle,
            inviterName: user.name,
            inviterAvatar: user.avatar,
          }),
        ),
      );
    }

    await publishAfterRoundCreated({
      visibility: createdRound.visibility,
      hostId: user.id,
      inviteeUserIds,
    });
    if (parsed.groupId) {
      await publishGroupActivityUpdated(parsed.groupId, "round-created");
    }

    return NextResponse.json({
      round: {
        ...createdRound,
        ...timeWindowResponseFields(createdRound.preferredTimeWindow),
        ...(!dbCap.hasTournamentCopyColumns
          ? { tournamentTitle: null, tournamentDetails: null }
          : {}),
      },
      invitePath: `/round/${createdRound.inviteToken}`,
      invitedCount,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const detail = JSON.stringify({ issues: error.issues, body: rawBody });
      console.error("[POST /api/rounds] ZodError", detail);
      return NextResponse.json(
        { error: "Invalid round payload.", details: detail },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST /api/rounds]", error);
    const dbDetail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Failed to create round.", details: dbDetail },
      { status: 500 },
    );
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
        planningLocation: rounds.planningLocation,
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
            ...timeWindowResponseFields(round.preferredTimeWindow),
            planningLocation: round.planningLocation,
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
        .filter((round) => new Date(round.effectiveDate) >= now),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to fetch rounds." }, { status: 500 });
  }
}
