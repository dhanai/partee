import Ably from "ably";
import {
  parfadeDiscoverChannel,
  parfadeProfileChannel,
  parfadeRoundDetailChannel,
  parfadeUserInboxChannel,
} from "@/lib/parfade-ably-channels";
import type { ParfadeRealtimeMessageV1 } from "@/lib/parfade-ably-messages";

const PARFADE_EVENT = "parfade";

let rest: Ably.Rest | null = null;

function getRest(): Ably.Rest | null {
  const key = process.env.ABLY_API_KEY?.trim();
  if (!key) return null;
  if (!rest) rest = new Ably.Rest({ key });
  return rest;
}

export async function publishParfadeMessage(
  channelName: string,
  payload: ParfadeRealtimeMessageV1,
): Promise<void> {
  const client = getRest();
  if (!client) return;
  await client.channels.get(channelName).publish(PARFADE_EVENT, payload);
}

function logPublishError(context: string, err: unknown) {
  console.error(`[parfade-ably-publish] ${context}`, err);
}

/** After a round is created: optional discover fanout + per-user inbox (host + invitees). */
export function publishAfterRoundCreated(params: {
  visibility: "public" | "private";
  hostId: string;
  inviteeUserIds: string[];
}): void {
  const { visibility, hostId, inviteeUserIds } = params;
  const inviteeSet = new Set(inviteeUserIds);

  if (visibility === "public") {
    void publishParfadeMessage(parfadeDiscoverChannel(), {
      v: 1,
      type: "discover-refresh",
      reason: "public-round-created",
    }).catch((e) => logPublishError("discover-refresh", e));
  }

  void publishParfadeMessage(parfadeUserInboxChannel(hostId), {
    v: 1,
    type: "inbox-sync",
    roundLists: true,
    reason: "round-created-host",
  }).catch((e) => logPublishError("inbox host", e));

  for (const uid of inviteeSet) {
    void publishParfadeMessage(parfadeUserInboxChannel(uid), {
      v: 1,
      type: "inbox-sync",
      roundLists: true,
      notificationBadge: true,
      reason: "round-created-invitee",
    }).catch((e) => logPublishError(`inbox invitee ${uid}`, e));
  }
}

/** When the profile owner updates; viewers subscribed to the profile channel refetch. */
export function publishAfterProfileUpdated(userId: string): void {
  void publishParfadeMessage(parfadeProfileChannel(userId), {
    v: 1,
    type: "profile-updated",
    userId,
  }).catch((e) => logPublishError("profile-updated", e));
}

/** Round detail screen: refetch when host edits, finalizes, spots/invites change, chat preview, etc. */
export function publishAfterRoundDetailChanged(
  inviteToken: string,
  reason?: string,
): void {
  const t = inviteToken.trim();
  if (!t) return;
  void publishParfadeMessage(parfadeRoundDetailChannel(t), {
    v: 1,
    type: "round-detail-updated",
    inviteToken: t,
    reason,
  }).catch((e) => logPublishError("round-detail-updated", e));
}

/**
 * In-app toast when a player RSVPs to a round the host created.
 */
export function publishRsvpToast(input: {
  hostId: string;
  inviteToken: string;
  roundTitle: string;
  guestName: string;
  guestAvatar: string | null;
  spotStatus: "confirmed" | "requested" | "declined";
}): void {
  void publishParfadeMessage(parfadeUserInboxChannel(input.hostId), {
    v: 1,
    type: "rsvp-toast",
    inviteToken: input.inviteToken,
    roundTitle: input.roundTitle,
    guestName: input.guestName,
    guestAvatar: input.guestAvatar ?? undefined,
    spotStatus: input.spotStatus,
  }).catch((e) => logPublishError("rsvp-toast", e));
}

/**
 * In-app toast when a user is invited to a round.
 * Also piggy-backs `roundLists` so the invitee's My Rounds list refreshes.
 */
export function publishRoundInviteToast(input: {
  inviteeUserId: string;
  inviteToken: string;
  roundTitle: string;
  inviterName: string;
  inviterAvatar: string | null;
}): void {
  void publishParfadeMessage(parfadeUserInboxChannel(input.inviteeUserId), {
    v: 1,
    type: "round-invite-toast",
    inviteToken: input.inviteToken,
    roundTitle: input.roundTitle,
    inviterName: input.inviterName,
    inviterAvatar: input.inviterAvatar ?? undefined,
  }).catch((e) => logPublishError("round-invite-toast", e));
}

/** In-app mustard dot + open notifications list refresh (follow / RSVP / invite rows). */
export function publishNotificationBadgeNudge(userId: string, reason?: string): void {
  void publishParfadeMessage(parfadeUserInboxChannel(userId), {
    v: 1,
    type: "inbox-sync",
    notificationBadge: true,
    reason,
  }).catch((e) => logPublishError("notification-badge-nudge", e));
}

