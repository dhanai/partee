import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { rounds, spots, users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { notifyRoundInvites } from "@/lib/notify-user";
import { buildRoundInvitePushBody } from "@/lib/round-invite-push-message";
import {
  publishAfterRoundDetailChanged,
  publishRoundInviteToast,
} from "@/lib/parfade-ably-publish";
import { formatChatPushTitleLine } from "@/lib/round-invite-push-message";
import { ROUND_INVITE_USER_IDS_MAX_PER_REQUEST } from "@/lib/round-invite-limits";

const inviteSchema = z.object({
  inviteeUserIds: z
    .array(z.string().uuid())
    .min(1)
    .max(ROUND_INVITE_USER_IDS_MAX_PER_REQUEST),
});

type RouteContext = {
  params: { token: string };
};

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const currentUser = await requireDbUser(req);
    const parsed = inviteSchema.parse(await req.json());

    const [round] = await db
      .select({
        id: rounds.id,
        hostId: rounds.hostId,
        courseName: rounds.courseName,
        planningLocation: rounds.planningLocation,
        mode: rounds.mode,
        teeTime: rounds.teeTime,
        targetDate: rounds.targetDate,
      })
      .from(rounds)
      .where(eq(rounds.inviteToken, params.token));

    if (!round) {
      return NextResponse.json({ error: "Round not found." }, { status: 404 });
    }

    const canInviteAsHost = round.hostId === currentUser.id;
    let canInviteAsClaimed = false;
    if (!canInviteAsHost) {
      const [currentSpot] = await db
        .select({ status: spots.status })
        .from(spots)
        .where(and(eq(spots.roundId, round.id), eq(spots.userId, currentUser.id)));
      canInviteAsClaimed = currentSpot?.status === "confirmed";
    }

    if (!canInviteAsHost && !canInviteAsClaimed) {
      return NextResponse.json(
        { error: "Only the host or claimed players can send invites." },
        { status: 403 },
      );
    }

    const dedupedInviteeIds = [
      ...new Set(parsed.inviteeUserIds.filter((id) => id !== currentUser.id)),
    ];
    if (dedupedInviteeIds.length === 0) {
      return NextResponse.json({ invitedCount: 0, skippedCount: 0 });
    }

    const validInvitees = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, dedupedInviteeIds));

    const existingSpots = await db
      .select({ userId: spots.userId, status: spots.status })
      .from(spots)
      .where(
        and(eq(spots.roundId, round.id), inArray(spots.userId, validInvitees.map((u) => u.id))),
      );

    const statusByUserId = new Map(existingSpots.map((s) => [s.userId, s.status]));

    const inviteRows = validInvitees
      .filter((invitee) => !statusByUserId.has(invitee.id))
      .map((invitee) => ({
        roundId: round.id,
        userId: invitee.id,
        status: "invited" as const,
      }));

    /** Users who declined earlier still have a spot row; allow host to invite them again. */
    const reinviteFromDeclinedIds = validInvitees
      .filter((invitee) => statusByUserId.get(invitee.id) === "declined")
      .map((invitee) => invitee.id);

    if (inviteRows.length > 0) {
      await db.insert(spots).values(inviteRows).onConflictDoNothing({
        target: [spots.roundId, spots.userId],
      });
    }

    if (reinviteFromDeclinedIds.length > 0) {
      await db
        .update(spots)
        .set({ status: "invited" })
        .where(
          and(
            eq(spots.roundId, round.id),
            inArray(spots.userId, reinviteFromDeclinedIds),
            eq(spots.status, "declined"),
          ),
        );
    }

    const notifiedUserIds = [
      ...inviteRows.map((r) => r.userId),
      ...reinviteFromDeclinedIds,
    ];

    if (notifiedUserIds.length > 0) {
      await notifyRoundInvites({
        inviteToken: params.token,
        inviteeUserIds: notifiedUserIds,
        inviterUserId: currentUser.id,
        body: buildRoundInvitePushBody({
          inviterDisplayName: currentUser.name,
          teeTime: round.teeTime,
          targetDate: round.targetDate,
          mode: round.mode,
          courseName: round.courseName,
          planningLocation: round.planningLocation,
        }),
      });
    }

    const roundTitle = formatChatPushTitleLine({
      courseName: round.courseName,
      planningLocation: round.planningLocation,
      mode: round.mode,
      teeTime: round.teeTime,
      targetDate: round.targetDate,
    });
    await Promise.all([
      ...notifiedUserIds.map((userId) =>
        publishRoundInviteToast({
          inviteeUserId: userId,
          inviteToken: params.token,
          roundTitle,
          inviterName: currentUser.name,
          inviterAvatar: currentUser.avatar,
        }),
      ),
      publishAfterRoundDetailChanged(params.token, "invites"),
    ]);

    const invitedCount = notifiedUserIds.length;

    return NextResponse.json({
      invitedCount,
      skippedCount: Math.max(0, dedupedInviteeIds.length - invitedCount),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid invite payload.", issues: error.flatten() },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to send invites." }, { status: 500 });
  }
}
