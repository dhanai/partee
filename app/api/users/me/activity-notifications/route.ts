import { and, desc, eq, inArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { courses, groupJoinRequests, inAppNotifications, posts, rounds, users } from "@/db/schema";
import { buildRoundNavHintJson } from "@/lib/activity-notification-round-hint";
import { requireDbUser } from "@/lib/auth";
import { formatVenueLabel } from "@/lib/round-invite-push-message";
import { toIsoTimestamp } from "@/lib/utils";

function inferRoundRsvpSpotStatus(input: {
  type: string;
  stored?: string;
  title: string;
}): "confirmed" | "requested" | "declined" {
  if (input.type === "round_rsvp_declined") return "declined";
  if (input.stored === "confirmed" || input.stored === "requested" || input.stored === "declined") {
    return input.stored;
  }
  if (input.title === "Join request") return "requested";
  return "confirmed";
}

const LIMIT = 50;

export async function GET(req: Request) {
  try {
    const viewer = await requireDbUser(req);

    const rows = await db
      .select({
        id: inAppNotifications.id,
        type: inAppNotifications.type,
        title: inAppNotifications.title,
        body: inAppNotifications.body,
        data: inAppNotifications.data,
        createdAt: inAppNotifications.createdAt,
      })
      .from(inAppNotifications)
      .where(eq(inAppNotifications.recipientUserId, viewer.id))
      .orderBy(desc(inAppNotifications.createdAt))
      .limit(LIMIT);

    const allActorIds = rows
      .map((r) => (r.data as { actorUserId?: string }).actorUserId)
      .filter((id): id is string => Boolean(id));
    const uniqueActorIds = [...new Set(allActorIds)];

    const actorProfileMap = new Map<string, { name: string; avatar: string | null }>();
    if (uniqueActorIds.length > 0) {
      const actorRows = await db
        .select({ id: users.id, name: users.name, avatar: users.avatar })
        .from(users)
        .where(inArray(users.id, uniqueActorIds));
      for (const a of actorRows) {
        actorProfileMap.set(a.id, { name: a.name, avatar: a.avatar });
      }
    }

    const groupJoinRows = rows.filter((r) => r.type === "group_join_request");
    const actorIdsForGroupJoins = groupJoinRows
      .map((r) => (r.data as { actorUserId?: string }).actorUserId)
      .filter((id): id is string => Boolean(id));

    const groupIds = groupJoinRows
      .map((r) => (r.data as { groupId?: string }).groupId)
      .filter((id): id is string => Boolean(id));

    const pendingRequestMap = new Map<string, { pending: boolean; requestId: string | null }>();
    if (groupIds.length > 0 && actorIdsForGroupJoins.length > 0) {
      const pendingRows = await db
        .select({
          id: groupJoinRequests.id,
          groupId: groupJoinRequests.groupId,
          userId: groupJoinRequests.userId,
          status: groupJoinRequests.status,
        })
        .from(groupJoinRequests)
        .where(
          and(
            inArray(groupJoinRequests.groupId, groupIds),
            inArray(groupJoinRequests.userId, actorIdsForGroupJoins),
          ),
        );
      for (const pr of pendingRows) {
        pendingRequestMap.set(`${pr.groupId}:${pr.userId}`, {
          pending: pr.status === "pending",
          requestId: pr.id,
        });
      }
    }

    const roundRsvpRows = rows.filter(
      (r) => r.type === "round_rsvp_accepted" || r.type === "round_rsvp_declined",
    );
    const roundHintRows = rows.filter(
      (r) =>
        r.type === "round_rsvp_accepted" ||
        r.type === "round_rsvp_declined" ||
        r.type === "round_invite",
    );
    const roundIdsForJoin = [
      ...new Set(
        roundRsvpRows
          .map((r) => (r.data as { roundId?: string }).roundId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const inviteTokensForJoin = [
      ...new Set(
        roundHintRows
          .map((r) => (r.data as { inviteToken?: string }).inviteToken)
          .filter((t): t is string => Boolean(t)),
      ),
    ];

    const postIds = [
      ...new Set(
        rows
          .map((r) => (r.data as { postId?: string }).postId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const postPreviewById = new Map<string, string | null>();
    if (postIds.length > 0) {
      const postRows = await db
        .select({
          id: posts.id,
          imageUrl: posts.imageUrl,
          imageUrls: posts.imageUrls,
        })
        .from(posts)
        .where(inArray(posts.id, postIds));
      for (const post of postRows) {
        const firstFromArray =
          Array.isArray(post.imageUrls) && post.imageUrls.length > 0 ? post.imageUrls[0] : null;
        postPreviewById.set(post.id, firstFromArray ?? post.imageUrl ?? null);
      }
    }

    type LiveRoundRow = {
      id: string;
      inviteToken: string;
      mode: "planning" | "scheduled";
      teeTime: Date | null;
      targetDate: Date;
      courseName: string | null;
      planningLocation: string | null;
      preferredTimeWindow: string[] | null;
      joinPolicy: "instant" | "approval";
      totalSpots: number;
      customImageUrl: string | null;
      courseMetadata: unknown | null;
      hostId: string;
      hostName: string;
      hostAvatar: string | null;
    };

    const roundById = new Map<string, LiveRoundRow>();
    const roundByInviteToken = new Map<string, LiveRoundRow>();

    if (roundIdsForJoin.length > 0 || inviteTokensForJoin.length > 0) {
      const conds = [];
      if (roundIdsForJoin.length > 0) conds.push(inArray(rounds.id, roundIdsForJoin));
      if (inviteTokensForJoin.length > 0) conds.push(inArray(rounds.inviteToken, inviteTokensForJoin));
      const whereClause = conds.length === 1 ? conds[0]! : or(...conds);

      const roundRows = await db
        .select({
          id: rounds.id,
          inviteToken: rounds.inviteToken,
          mode: rounds.mode,
          teeTime: rounds.teeTime,
          targetDate: rounds.targetDate,
          courseName: rounds.courseName,
          planningLocation: rounds.planningLocation,
          preferredTimeWindow: rounds.preferredTimeWindow,
          joinPolicy: rounds.joinPolicy,
          totalSpots: rounds.totalSpots,
          customImageUrl: rounds.customImageUrl,
          hostId: rounds.hostId,
          hostName: users.name,
          hostAvatar: users.avatar,
          courseMetadata: courses.metadata,
        })
        .from(rounds)
        .innerJoin(users, eq(users.id, rounds.hostId))
        .leftJoin(courses, eq(courses.id, rounds.courseId))
        .where(whereClause);

      for (const row of roundRows) {
        const live: LiveRoundRow = {
          id: row.id,
          inviteToken: row.inviteToken,
          mode: row.mode as "planning" | "scheduled",
          teeTime: row.teeTime,
          targetDate: row.targetDate,
          courseName: row.courseName,
          planningLocation: row.planningLocation,
          preferredTimeWindow: row.preferredTimeWindow,
          joinPolicy: row.joinPolicy as "instant" | "approval",
          totalSpots: row.totalSpots,
          customImageUrl: row.customImageUrl,
          courseMetadata: row.courseMetadata,
          hostId: row.hostId,
          hostName: row.hostName,
          hostAvatar: row.hostAvatar,
        };
        roundById.set(row.id, live);
        roundByInviteToken.set(row.inviteToken, live);
      }
    }

    const items = rows.flatMap((r) => {
      try {
        const d = r.data as {
          roundId?: string;
          inviteToken?: string;
          groupId?: string;
          postId?: string;
          commentId?: string;
          parentCommentId?: string;
          replyToCommentId?: string;
          actorUserId?: string;
          mode?: "planning" | "scheduled";
          teeTimeIso?: string | null;
          targetDateIso?: string;
          venueLabel?: string;
          spotStatus?: "confirmed" | "requested" | "declined";
        };
        const inviteToken = typeof d.inviteToken === "string" ? d.inviteToken : "";
        const groupId = typeof d.groupId === "string" ? d.groupId : "";
        const postId = typeof d.postId === "string" ? d.postId : "";
        const commentId = typeof d.commentId === "string" ? d.commentId : "";
        const parentCommentId = typeof d.parentCommentId === "string" ? d.parentCommentId : "";
        const replyToCommentId = typeof d.replyToCommentId === "string" ? d.replyToCommentId : "";
        const actorUserId = typeof d.actorUserId === "string" ? d.actorUserId : "";
        const previewImageUrlFromData =
          typeof (d as { previewImageUrl?: string }).previewImageUrl === "string"
            ? (d as { previewImageUrl?: string }).previewImageUrl!.trim()
            : "";

        const actorProfile = actorUserId ? actorProfileMap.get(actorUserId) : undefined;

        if (actorUserId && !actorProfile) return [];

        const requestEntry = groupId && actorUserId
          ? pendingRequestMap.get(`${groupId}:${actorUserId}`)
          : undefined;

        let roundRsvpMeta:
          | {
              mode: "planning" | "scheduled";
              teeTimeIso: string | null;
              targetDateIso: string;
              venueLabel: string;
              spotStatus: "confirmed" | "requested" | "declined";
              preferredTimeWindows: string[] | null;
            }
          | undefined;

        let roundHint: string | undefined;

        if (
          r.type === "round_rsvp_accepted" ||
          r.type === "round_rsvp_declined" ||
          r.type === "round_invite"
        ) {
          const spotStatus = inferRoundRsvpSpotStatus({
            type: r.type,
            stored: d.spotStatus,
            title: r.title,
          });
          const live =
            (typeof d.roundId === "string" ? roundById.get(d.roundId) : undefined) ??
            (typeof d.inviteToken === "string" ? roundByInviteToken.get(d.inviteToken) : undefined);
          if (live) {
            if (r.type === "round_rsvp_accepted" || r.type === "round_rsvp_declined") {
              roundRsvpMeta = {
                mode: live.mode,
                teeTimeIso: live.teeTime?.toISOString() ?? null,
                targetDateIso: live.targetDate.toISOString(),
                venueLabel: formatVenueLabel({
                  courseName: live.courseName,
                  planningLocation: live.planningLocation,
                }),
                spotStatus,
                preferredTimeWindows: live.preferredTimeWindow,
              };
            }
            roundHint = buildRoundNavHintJson({
              id: live.id,
              inviteToken: live.inviteToken,
              mode: live.mode,
              courseName: live.courseName,
              teeTime: live.teeTime,
              targetDate: live.targetDate,
              preferredTimeWindow: live.preferredTimeWindow,
              planningLocation: live.planningLocation,
              joinPolicy: live.joinPolicy,
              totalSpots: live.totalSpots,
              customImageUrl: live.customImageUrl,
              courseMetadata: (live.courseMetadata ?? null) as Record<string, unknown> | null,
              hostId: live.hostId,
              hostName: live.hostName,
              hostAvatar: live.hostAvatar,
            });
          } else if (
            typeof d.venueLabel === "string" &&
            d.venueLabel.length > 0 &&
            typeof d.targetDateIso === "string" &&
            (d.mode === "planning" || d.mode === "scheduled")
          ) {
            roundRsvpMeta = {
              mode: d.mode,
              teeTimeIso: d.teeTimeIso ?? null,
              targetDateIso: d.targetDateIso,
              venueLabel: d.venueLabel,
              spotStatus,
              preferredTimeWindows: null,
            };
          }
        }

        return [
          {
            id: r.id,
            type: r.type,
            title: r.title,
            body: r.body,
            inviteToken,
            groupId,
            postId,
            commentId,
            parentCommentId,
            replyToCommentId,
            actorUserId,
            actorName: actorProfile?.name ?? "",
            actorAvatar: actorProfile?.avatar ?? null,
            previewImageUrl:
              previewImageUrlFromData ||
              (postId ? (postPreviewById.get(postId) ?? "") : ""),
            stillPending: requestEntry?.pending ?? false,
            joinRequestId: requestEntry?.requestId ?? null,
            createdAt: toIsoTimestamp(r.createdAt),
            ...(roundRsvpMeta ? { roundRsvpMeta } : {}),
            ...(roundHint ? { roundHint } : {}),
          },
        ];
      } catch (rowErr) {
        console.error("activity-notifications: skip row", r.id, rowErr);
        return [];
      }
    });

    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const msg = error instanceof Error ? error.message : String(error);
    if (/in_app_notifications/i.test(msg) && /does not exist/i.test(msg)) {
      console.error("in_app_notifications table missing; returning empty feed", error);
      return NextResponse.json({ items: [] });
    }
    console.error(error);
    return NextResponse.json({ error: "Unable to load notifications." }, { status: 500 });
  }
}
