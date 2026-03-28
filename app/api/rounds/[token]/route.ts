import { NextResponse } from "next/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { conversationParticipants, conversations, courses, messages, rounds, spots, users } from "@/db/schema";
import { orderConfirmedPlayersHostFirstByClaimOrder } from "@/lib/confirmed-players-order";
import { ensureDbUser, requireDbUser } from "@/lib/auth";
import { resolveValidatedUsLocationLabel } from "@/lib/places";
import { resolveRoundImageUrl } from "@/lib/round-images";
import { publishAfterRoundDetailChanged } from "@/lib/parfade-ably-publish";
import { textArraySql, timeWindowResponseFields } from "@/lib/round-time-window-compat";

type RouteContext = {
  params: { token: string };
};

const updateRoundSchema = z
  .object({
    planningMode: z.boolean().default(false),
    preferredTimeWindow: z.preprocess(
      (val) => (typeof val === "string" ? [val] : val),
      z.array(z.enum(["morning", "afternoon", "twilight"])).max(3),
    ).optional(),
    planningLocation: z.string().trim().min(2).max(80).optional(),
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
      if (!payload.planningLocation) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["planningLocation"],
          message: "Planning location is required for planning rounds.",
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
    if (payload.planningLocation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["planningLocation"],
        message: "planningLocation is only valid for planning rounds.",
      });
    }
  });

export async function GET(req: Request, { params }: RouteContext) {
  const token = params.token;
  if (!token) {
    return NextResponse.json({ error: "Token is required." }, { status: 400 });
  }

  const [round] = await db
    .select({
      id: rounds.id,
      inviteToken: rounds.inviteToken,
      mode: rounds.mode,
      preferredTimeWindow: rounds.preferredTimeWindow,
      planningLocation: rounds.planningLocation,
      courseId: rounds.courseId,
      courseName: rounds.courseName,
      teeTime: rounds.teeTime,
      targetDate: rounds.targetDate,
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

  const currentUser = await ensureDbUser(req);
  let currentUserSpotStatus: string | null = null;
  if (currentUser) {
    const [existingSpot] = await db
      .select({ status: spots.status })
      .from(spots)
      .where(and(eq(spots.roundId, round.id), eq(spots.userId, currentUser.id)));
    currentUserSpotStatus = existingSpot?.status ?? null;
  }

  const confirmedRows = await db
    .select({
      id: users.id,
      name: users.name,
      avatar: users.avatar,
      claimedAt: spots.createdAt,
    })
    .from(spots)
    .innerJoin(users, eq(users.id, spots.userId))
    .where(and(eq(spots.roundId, round.id), eq(spots.status, "confirmed")))
    .orderBy(asc(spots.createdAt));
  const confirmedPlayers = orderConfirmedPlayersHostFirstByClaimOrder(
    confirmedRows,
    round.hostId,
  );

  const declinedPlayers = await db
    .select({
      id: users.id,
      name: users.name,
      avatar: users.avatar,
    })
    .from(spots)
    .innerJoin(users, eq(users.id, spots.userId))
    .where(and(eq(spots.roundId, round.id), eq(spots.status, "declined")))
    .orderBy(asc(spots.createdAt));

  const [conv] = currentUser
    ? await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(and(eq(conversations.roundId, round.id), eq(conversations.type, "round")))
        .limit(1)
    : [undefined];

  let chatAllowed = false;
  if (conv && currentUser) {
    const [participant] = await db
      .select({ id: conversationParticipants.id })
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conv.id),
          eq(conversationParticipants.userId, currentUser.id),
        ),
      )
      .limit(1);
    chatAllowed = Boolean(participant);
  }

  let lastChatMessage: {
    body: string;
    senderName: string;
    createdAt: string;
  } | null = null;
  if (chatAllowed && conv) {
    const [lastRow] = await db
      .select({
        body: messages.body,
        createdAt: messages.createdAt,
        senderName: users.name,
      })
      .from(messages)
      .innerJoin(users, eq(users.id, messages.userId))
      .where(eq(messages.conversationId, conv.id))
      .orderBy(desc(messages.createdAt))
      .limit(1);
    if (lastRow) {
      lastChatMessage = {
        body: lastRow.body ?? "",
        senderName: lastRow.senderName,
        createdAt: lastRow.createdAt.toISOString(),
      };
    }
  }

  return NextResponse.json({
    round: {
      id: round.id,
      inviteToken: round.inviteToken,
      mode: round.mode,
      ...timeWindowResponseFields(round.preferredTimeWindow),
      planningLocation: round.planningLocation,
      courseId: round.courseId,
      courseName: round.courseName ?? "Course TBD",
      teeTime: round.teeTime,
      targetDate: round.targetDate,
      visibility: round.visibility,
      totalSpots: round.totalSpots,
      status: round.status,
      joinPolicy: round.joinPolicy,
      customImageUrl: round.customImageUrl,
      hostId: round.hostId,
      hostName: round.hostName,
      hostAvatar: round.hostAvatar,
      confirmedCount: round.confirmedCount,
      confirmedPlayers,
      declinedPlayers,
      spotsRemaining: Math.max(0, round.totalSpots - round.confirmedCount),
      isHost: currentUser?.id === round.hostId,
      currentUserSpotStatus,
      imageUrl: resolveRoundImageUrl({
        customImageUrl: round.customImageUrl,
        courseMetadata: round.courseMetadata,
      }),
      ...(chatAllowed ? { lastChatMessage, conversationId: conv?.id ?? null } : {}),
    },
  });
}

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const currentUser = await requireDbUser(req);
    const token = params.token;
    if (!token) {
      return NextResponse.json({ error: "Token is required." }, { status: 400 });
    }

    const parsed = updateRoundSchema.parse(await req.json());
    const [existingRound] = await db
      .select({
        id: rounds.id,
        hostId: rounds.hostId,
      })
      .from(rounds)
      .where(eq(rounds.inviteToken, token));

    if (!existingRound) {
      return NextResponse.json({ error: "Round not found." }, { status: 404 });
    }
    if (existingRound.hostId !== currentUser.id) {
      return NextResponse.json(
        { error: "Only the host can edit this round." },
        { status: 403 },
      );
    }

    const now = Date.now();
    let teeTime: Date | null = null;
    let targetDate: Date;
    let course: { id: string; name: string } | null = null;

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
        .select({ id: courses.id, name: courses.name })
        .from(courses)
        .where(eq(courses.id, parsed.courseId as string));
      if (!selectedCourse) {
        return NextResponse.json({ error: "Course not found." }, { status: 404 });
      }
      course = selectedCourse;
      targetDate = teeTime;
    }

    await db
      .update(rounds)
      .set({
        mode: parsed.planningMode ? "planning" : "scheduled",
        preferredTimeWindow: parsed.planningMode
          ? textArraySql(parsed.preferredTimeWindow?.length ? parsed.preferredTimeWindow : null)
          : null,
        planningLocation: parsed.planningMode
          ? (parsed.planningLocation?.trim() ?? null)
          : null,
        courseId: course?.id ?? null,
        courseName: course?.name ?? null,
        teeTime,
        targetDate,
        totalSpots: parsed.totalSpots,
        visibility: parsed.visibility,
        joinPolicy: parsed.joinPolicy,
        customImageUrl:
          parsed.customImageUrl && parsed.customImageUrl.trim().length > 0
            ? parsed.customImageUrl.trim()
            : null,
      })
      .where(eq(rounds.id, existingRound.id));

    await publishAfterRoundDetailChanged(token, "patch");

    return NextResponse.json({ ok: true });
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
    return NextResponse.json({ error: "Unable to edit round." }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: RouteContext) {
  try {
    const currentUser = await requireDbUser(req);
    const token = params.token;
    if (!token) {
      return NextResponse.json({ error: "Token is required." }, { status: 400 });
    }

    const [round] = await db
      .select({
        id: rounds.id,
        hostId: rounds.hostId,
      })
      .from(rounds)
      .where(eq(rounds.inviteToken, token));

    if (!round) {
      return NextResponse.json({ error: "Round not found." }, { status: 404 });
    }

    if (round.hostId !== currentUser.id) {
      return NextResponse.json(
        { error: "Only the host can delete this round." },
        { status: 403 },
      );
    }

    await publishAfterRoundDetailChanged(token, "delete");
    await db.delete(rounds).where(eq(rounds.id, round.id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to delete round." }, { status: 500 });
  }
}
