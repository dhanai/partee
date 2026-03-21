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
  publishNotificationBadgeNudge,
} from "@/lib/parfade-ably-publish";

const inviteSchema = z.object({
  inviteeUserIds: z.array(z.string().uuid()).min(1).max(30),
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
      .select({ userId: spots.userId })
      .from(spots)
      .where(
        and(eq(spots.roundId, round.id), inArray(spots.userId, validInvitees.map((u) => u.id))),
      );

    const existingUserIds = new Set(existingSpots.map((spot) => spot.userId));
    const inviteRows = validInvitees
      .filter((invitee) => !existingUserIds.has(invitee.id))
      .map((invitee) => ({
        roundId: round.id,
        userId: invitee.id,
        status: "invited" as const,
      }));

    if (inviteRows.length > 0) {
      await db.insert(spots).values(inviteRows).onConflictDoNothing({
        target: [spots.roundId, spots.userId],
      });
      void notifyRoundInvites({
        inviteToken: params.token,
        inviteeUserIds: inviteRows.map((r) => r.userId),
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

    for (const row of inviteRows) {
      publishNotificationBadgeNudge(row.userId, "round-invite");
    }

    publishAfterRoundDetailChanged(params.token, "invites");

    return NextResponse.json({
      invitedCount: inviteRows.length,
      skippedCount: Math.max(0, dedupedInviteeIds.length - inviteRows.length),
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
