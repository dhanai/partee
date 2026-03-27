import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { conversationParticipants, groupMembers, inAppNotifications, users } from "@/db/schema";
import {
  buildHostRsvpNotificationCopy,
  formatInviterFirstLastInitial,
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
  mode: "planning" | "scheduled";
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

  await db.insert(inAppNotifications).values({
    recipientUserId: input.hostId,
    type,
    title,
    body,
    data: {
      roundId: input.roundId,
      inviteToken: input.inviteToken,
      actorUserId: input.guestId,
    },
  });

  publishNotificationBadgeNudge(input.hostId, "round-rsvp");

  if (!accepted) return;

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
  body: string;
}): Promise<void> {
  if (input.inviteeUserIds.length === 0) return;

  const rows = await db
    .select({ token: users.expoPushToken })
    .from(users)
    .where(inArray(users.id, input.inviteeUserIds));

  const tokens = rows
    .map((r) => r.token?.trim())
    .filter((t): t is string => Boolean(t));

  if (tokens.length === 0) {
    if (input.inviteeUserIds.length > 0) {
      const hint =
        process.env.EXPO_ACCESS_TOKEN && process.env.EXPO_PUSH_DISABLED !== "1"
          ? "Invitee(s) have no expo_push_token in DB (app never registered push, or permission denied)."
          : "Set EXPO_ACCESS_TOKEN on the API host to send pushes (or EXPO_PUSH_DISABLED=1 to silence).";
      if (process.env.EXPO_DEBUG_PUSH === "1") {
        console.warn("[notifyRoundInvites] No push tokens for invitees.", {
          inviteeCount: input.inviteeUserIds.length,
          hint,
        });
      }
    }
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
  body: string;
  memberUserIds: string[];
}): Promise<void> {
  const recipientIds = input.memberUserIds.filter((id) => id !== input.senderUserId);
  if (recipientIds.length === 0) return;

  const rows = await db
    .select({ token: users.expoPushToken })
    .from(users)
    .where(inArray(users.id, recipientIds));

  const tokens = rows
    .map((r) => r.token?.trim())
    .filter((t): t is string => Boolean(t));

  if (tokens.length === 0) return;

  const preview = input.body.length > 120 ? `${input.body.slice(0, 117)}…` : input.body;

  await sendExpoPushMessages(
    tokens.map((to) => ({
      to,
      sound: "default" as const,
      title: `${input.groupName} — Post`,
      body: `${input.senderName}: ${preview}`,
      data: { type: "group_post", groupId: input.groupId },
    })),
  );
}

const DM_PREVIEW_MAX = 140;

export async function notifyConversationMessage(input: {
  conversationId: string;
  senderUserId: string;
  senderName: string;
  messageBody: string;
}): Promise<void> {
  const recipientRows = await db
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, input.conversationId),
        ne(conversationParticipants.userId, input.senderUserId),
      ),
    );

  const recipientIds = recipientRows.map((r) => r.userId);
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
