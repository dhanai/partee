import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { conversationParticipants, groupMembers, inAppNotifications, users } from "@/db/schema";
import {
  buildHostRsvpNotificationCopy,
  formatInviterFirstLastInitial,
  formatVenueLabel,
} from "@/lib/round-invite-push-message";
import { publishNotificationBadgeNudge } from "@/lib/parfade-ably-publish";
import { sendExpoPushMessages } from "@/lib/push-expo";

/**
 * When an invitee RSVPs, record an in-app notification for the host.
 * Push is sent only for accept paths (confirmed / requested), not for decline.
 */
export async function recordHostRoundRsvpAndMaybePush(input: {
  hostId: string;
  guestId: string;
  guestName: string;
  roundId: string;
  inviteToken: string;
  courseName: string | null;
  planningLocation: string | null;
  mode: "planning" | "scheduled" | "tournament";
  teeTime: Date | null;
  targetDate: Date;
  spotStatus: "confirmed" | "requested" | "declined";
}): Promise<void> {
  if (input.hostId === input.guestId) return;

  const accepted = input.spotStatus !== "declined";
  const type = accepted ? "round_rsvp_accepted" : "round_rsvp_declined";
  const { title, body } = buildHostRsvpNotificationCopy({
    guestName: input.guestName,
    courseName: input.courseName,
    planningLocation: input.planningLocation,
    mode: input.mode,
    teeTime: input.teeTime,
    targetDate: input.targetDate,
    spotStatus: input.spotStatus,
  });

  const venueLabel = formatVenueLabel({
    courseName: input.courseName,
    planningLocation: input.planningLocation,
  });

  await db.insert(inAppNotifications).values({
    recipientUserId: input.hostId,
    type,
    title,
    body,
    data: {
      roundId: input.roundId,
      inviteToken: input.inviteToken,
      actorUserId: input.guestId,
      mode: input.mode,
      teeTimeIso: input.teeTime?.toISOString() ?? null,
      targetDateIso: input.targetDate.toISOString(),
      venueLabel,
      spotStatus: input.spotStatus,
    },
  });

  publishNotificationBadgeNudge(input.hostId, "round-rsvp");

  const [row] = await db
    .select({ token: users.expoPushToken })
    .from(users)
    .where(eq(users.id, input.hostId))
    .limit(1);

  const token = row?.token?.trim();
  if (!token) {
    if (process.env.EXPO_DEBUG_PUSH === "1") {
      console.warn("[recordHostRoundRsvpAndMaybePush] Host has no expo_push_token.", {
        hostId: input.hostId,
      });
    }
    return;
  }

  await sendExpoPushMessages([
    {
      to: token,
      sound: "default",
      title,
      body,
      data: {
        type: "round_rsvp",
        inviteToken: input.inviteToken,
        spotStatus: input.spotStatus,
        ...(input.spotStatus === "requested" ? { hostJoinRequests: "1" as const } : {}),
      },
    },
  ]);
}

export async function notifyFollowRequest(input: {
  followedUserId: string;
  followerName: string;
}): Promise<void> {
  const [row] = await db
    .select({ token: users.expoPushToken })
    .from(users)
    .where(eq(users.id, input.followedUserId))
    .limit(1);

  const token = row?.token?.trim();
  if (token) {
    await sendExpoPushMessages([
      {
        to: token,
        sound: "default",
        title: "New follow request",
        body: `${input.followerName} wants to follow you on Parfade.`,
        data: { type: "follow_request" },
      },
    ]);
  }

  publishNotificationBadgeNudge(input.followedUserId, "follow-request");
}

export async function notifyRoundInvites(input: {
  inviteToken: string;
  inviteeUserIds: string[];
  inviterUserId: string;
  body: string;
}): Promise<void> {
  if (input.inviteeUserIds.length === 0) return;

  await Promise.all(
    input.inviteeUserIds.map(async (recipientUserId) => {
      await db.insert(inAppNotifications).values({
        recipientUserId,
        type: "round_invite",
        title: "Round invite",
        body: input.body,
        data: {
          inviteToken: input.inviteToken,
          actorUserId: input.inviterUserId,
        },
      });
      publishNotificationBadgeNudge(recipientUserId, "round-invite").catch(() => {});
    }),
  );

  const rows = await db
    .select({ token: users.expoPushToken })
    .from(users)
    .where(inArray(users.id, input.inviteeUserIds));

  const tokens = rows
    .map((r) => r.token?.trim())
    .filter((t): t is string => Boolean(t));

  if (tokens.length === 0) {
    return;
  }

  const data = {
    type: "round_invite",
    inviteToken: input.inviteToken,
  } as const;

  await sendExpoPushMessages(
    tokens.map((to) => ({
      to,
      sound: "default" as const,
      title: "Round invite",
      body: input.body,
      data,
    })),
  );
}

export async function notifyGroupPost(input: {
  groupId: string;
  groupName: string;
  senderUserId: string;
  senderName: string;
  postId: string;
  body: string;
  memberUserIds: string[];
}): Promise<void> {
  const recipientIds = input.memberUserIds.filter((id) => id !== input.senderUserId);
  if (recipientIds.length === 0) return;

  const normalizedBody = input.body.trim();
  const preview =
    normalizedBody.length === 0
      ? "Shared new photos."
      : normalizedBody.length > 120
        ? `${normalizedBody.slice(0, 117)}…`
        : normalizedBody;
  const title = `${input.groupName} — New post`;
  const body = `${input.senderName}: ${preview}`;

  await Promise.all(
    recipientIds.map((recipientUserId) =>
      db.insert(inAppNotifications).values({
        recipientUserId,
        type: "group_post",
        title,
        body,
        data: {
          groupId: input.groupId,
          postId: input.postId,
          actorUserId: input.senderUserId,
        },
      }),
    ),
  );

  for (const recipientUserId of recipientIds) {
    publishNotificationBadgeNudge(recipientUserId, "group-post");
  }

  const mutedRows = await db
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, input.groupId),
        inArray(groupMembers.userId, recipientIds),
        eq(groupMembers.muteGroupPush, true),
      ),
    );
  const mutedSet = new Set(mutedRows.map((row) => row.userId));
  const pushRecipientIds = recipientIds.filter((id) => !mutedSet.has(id));
  if (pushRecipientIds.length === 0) return;

  const rows = await db
    .select({ token: users.expoPushToken })
    .from(users)
    .where(inArray(users.id, pushRecipientIds));

  const tokens = rows
    .map((r) => r.token?.trim())
    .filter((t): t is string => Boolean(t));

  if (tokens.length === 0) return;

  await sendExpoPushMessages(
    tokens.map((to) => ({
      to,
      sound: "default" as const,
      title,
      body,
      data: { type: "group_post", groupId: input.groupId },
    })),
  );
}

export async function notifyProfilePost(input: {
  recipientUserId: string;
  senderUserId: string;
  senderName: string;
  postId: string;
  previewBody: string;
}): Promise<void> {
  if (input.recipientUserId === input.senderUserId) return;

  const preview =
    input.previewBody.length > 120 ? `${input.previewBody.slice(0, 117)}…` : input.previewBody;
  const title = `${input.senderName} posted on your profile`;
  const body = preview.length > 0 ? preview : "Tap to view";

  await db.insert(inAppNotifications).values({
    recipientUserId: input.recipientUserId,
    type: "profile_post",
    title,
    body,
    data: {
      postId: input.postId,
      actorUserId: input.senderUserId,
    },
  });

  publishNotificationBadgeNudge(input.recipientUserId, "profile-post");

  const [row] = await db
    .select({ token: users.expoPushToken })
    .from(users)
    .where(eq(users.id, input.recipientUserId))
    .limit(1);

  const token = row?.token?.trim();
  if (!token) return;

  await sendExpoPushMessages([
    {
      to: token,
      sound: "default",
      title,
      body,
      data: { type: "profile_post", postId: input.postId },
    },
  ]);
}

export async function notifyPostInteraction(input: {
  recipientUserId: string;
  actorUserId: string;
  actorName: string;
  postId: string;
  kind: "liked" | "commented";
  groupId?: string | null;
  commentBody?: string;
  commentContext?: "comment" | "reply";
  commentId?: string;
  parentCommentId?: string | null;
  replyToCommentId?: string | null;
}): Promise<void> {
  if (input.recipientUserId === input.actorUserId) return;

  const type = input.kind === "liked" ? "post_liked" : "post_commented";
  const isReply = input.kind === "commented" && input.commentContext === "reply";
  const title = input.kind === "liked" ? "Post liked" : isReply ? "New reply" : "New comment";
  const body =
    input.kind === "liked"
      ? `${input.actorName} liked your post.`
      : isReply
        ? `${input.actorName} replied to your comment${
            input.commentBody?.trim() ? `: ${input.commentBody.trim().slice(0, 80)}` : "."
          }`
        : `${input.actorName} commented on your post${
            input.commentBody?.trim() ? `: ${input.commentBody.trim().slice(0, 80)}` : "."
          }`;

  await db.insert(inAppNotifications).values({
    recipientUserId: input.recipientUserId,
    type,
    title,
    body,
    data: {
      actorUserId: input.actorUserId,
      postId: input.postId,
      ...(input.commentId ? { commentId: input.commentId } : {}),
      ...(input.parentCommentId ? { parentCommentId: input.parentCommentId } : {}),
      ...(input.replyToCommentId ? { replyToCommentId: input.replyToCommentId } : {}),
      ...(input.groupId ? { groupId: input.groupId } : {}),
    },
  });

  publishNotificationBadgeNudge(input.recipientUserId, type).catch(() => {});

  const [row] = await db
    .select({ token: users.expoPushToken })
    .from(users)
    .where(eq(users.id, input.recipientUserId))
    .limit(1);

  const token = row?.token?.trim();
  if (!token) return;

  await sendExpoPushMessages([
    {
      to: token,
      sound: "default",
      title,
      body,
      data: {
        type,
        postId: input.postId,
        ...(input.commentId ? { commentId: input.commentId } : {}),
        ...(input.parentCommentId ? { parentCommentId: input.parentCommentId } : {}),
        ...(input.replyToCommentId ? { replyToCommentId: input.replyToCommentId } : {}),
        ...(input.groupId ? { groupId: input.groupId } : {}),
      },
    },
  ]);
}

const DM_PREVIEW_MAX = 140;

export async function notifyConversationMessage(input: {
  conversationId: string;
  senderUserId: string;
  senderName: string;
  messageBody: string;
}): Promise<void> {
  const recipientRows = await db
    .select({
      userId: conversationParticipants.userId,
      muted: conversationParticipants.muted,
    })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, input.conversationId),
        ne(conversationParticipants.userId, input.senderUserId),
      ),
    );

  const recipientIds = recipientRows
    .filter((r) => !r.muted)
    .map((r) => r.userId);
  if (recipientIds.length === 0) return;

  const tokenRows = await db
    .select({ token: users.expoPushToken })
    .from(users)
    .where(inArray(users.id, recipientIds));

  const tokens = tokenRows
    .map((r) => r.token?.trim())
    .filter((t): t is string => Boolean(t));

  if (tokens.length === 0) return;

  const who = formatInviterFirstLastInitial(input.senderName);
  const raw = input.messageBody.trim();
  const preview =
    raw.length > DM_PREVIEW_MAX ? `${raw.slice(0, DM_PREVIEW_MAX - 1)}…` : raw;

  await sendExpoPushMessages(
    tokens.map((to) => ({
      to,
      sound: "default" as const,
      title: who,
      body: preview,
      data: {
        type: "conversation_message",
        conversationId: input.conversationId,
      },
    })),
  );
}

export async function notifyGroupJoinRequest(input: {
  groupId: string;
  groupName: string;
  requesterId: string;
  requesterName: string;
}): Promise<void> {
  const adminRows = await db
    .select({ userId: groupMembers.userId, role: groupMembers.role })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, input.groupId));

  const recipientIds = adminRows
    .filter((r) => (r.role === "owner" || r.role === "admin") && r.userId !== input.requesterId)
    .map((r) => r.userId);

  if (recipientIds.length === 0) return;

  const title = `${input.groupName}`;
  const body = `${formatInviterFirstLastInitial(input.requesterName)} wants to join your group.`;

  await Promise.all(
    recipientIds.map((adminId) =>
      db.insert(inAppNotifications).values({
        recipientUserId: adminId,
        type: "group_join_request",
        title,
        body,
        data: {
          groupId: input.groupId,
          actorUserId: input.requesterId,
        },
      }),
    ),
  );

  for (const adminId of recipientIds) {
    publishNotificationBadgeNudge(adminId, "group-join-request");
  }

  const tokenRows = await db
    .select({ token: users.expoPushToken })
    .from(users)
    .where(inArray(users.id, recipientIds));

  const tokens = tokenRows
    .map((r) => r.token?.trim())
    .filter((t): t is string => Boolean(t));

  if (tokens.length === 0) return;

  await sendExpoPushMessages(
    tokens.map((to) => ({
      to,
      sound: "default" as const,
      title,
      body,
      data: { type: "group_join_request", groupId: input.groupId },
    })),
  );
}
