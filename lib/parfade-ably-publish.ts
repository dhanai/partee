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

/**
 * Send different payloads to different channels in a single Ably REST call.
 * Falls back to individual publishes if batch API fails.
 */
export async function batchPublishParfadeMessages(
  items: { channel: string; payload: ParfadeRealtimeMessageV1 }[],
): Promise<void> {
  if (items.length === 0) return;
  if (items.length === 1) {
    await publishParfadeMessage(items[0]!.channel, items[0]!.payload);
    return;
  }
  const client = getRest();
  if (!client) return;

  const body = items.map((item) => ({
    channel: item.channel,
    messages: [{ name: PARFADE_EVENT, data: item.payload }],
  }));

  try {
    await client.request("POST", "/messages", 2, {}, body);
  } catch {
    await Promise.all(
      items.map((item) =>
        publishParfadeMessage(item.channel, item.payload).catch(() => {}),
      ),
    );
  }
}

function logPublishError(context: string, err: unknown) {
  console.error(`[parfade-ably-publish] ${context}`, err);
}

/** After a round is created: optional discover fanout + per-user inbox (host + invitees). */
export async function publishAfterRoundCreated(params: {
  visibility: "public" | "private";
  hostId: string;
  inviteeUserIds: string[];
}): Promise<void> {
  const { visibility, hostId, inviteeUserIds } = params;
  const inviteeSet = new Set(inviteeUserIds);

  const items: { channel: string; payload: ParfadeRealtimeMessageV1 }[] = [];

  if (visibility === "public") {
    items.push({
      channel: parfadeDiscoverChannel(),
      payload: { v: 1, type: "discover-refresh", reason: "public-round-created" },
    });
  }

  items.push({
    channel: parfadeUserInboxChannel(hostId),
    payload: { v: 1, type: "inbox-sync", roundLists: true, reason: "round-created-host" },
  });

  for (const uid of inviteeSet) {
    items.push({
      channel: parfadeUserInboxChannel(uid),
      payload: { v: 1, type: "inbox-sync", roundLists: true, notificationBadge: true, reason: "round-created-invitee" },
    });
  }

  await batchPublishParfadeMessages(items).catch((e) => logPublishError("round-created batch", e));
}

/** When the profile owner updates; viewers subscribed to the profile channel refetch. */
export async function publishAfterProfileUpdated(userId: string): Promise<void> {
  await publishParfadeMessage(parfadeProfileChannel(userId), {
    v: 1,
    type: "profile-updated",
    userId,
  }).catch((e) => logPublishError("profile-updated", e));
}

/** Round detail screen: refetch when host edits, finalizes, spots/invites change, chat preview, etc. */
export async function publishAfterRoundDetailChanged(
  inviteToken: string,
  reason?: string,
): Promise<void> {
  const t = inviteToken.trim();
  if (!t) return;
  await publishParfadeMessage(parfadeRoundDetailChannel(t), {
    v: 1,
    type: "round-detail-updated",
    inviteToken: t,
    reason,
  }).catch((e) => logPublishError("round-detail-updated", e));
}

/**
 * In-app toast when a player RSVPs to a round the host created.
 */
export async function publishRsvpToast(input: {
  hostId: string;
  inviteToken: string;
  roundTitle: string;
  guestName: string;
  guestAvatar: string | null;
  spotStatus: "confirmed" | "requested" | "declined";
}): Promise<void> {
  await publishParfadeMessage(parfadeUserInboxChannel(input.hostId), {
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
export async function publishRoundInviteToast(input: {
  inviteeUserId: string;
  inviteToken: string;
  roundTitle: string;
  inviterName: string;
  inviterAvatar: string | null;
}): Promise<void> {
  await publishParfadeMessage(parfadeUserInboxChannel(input.inviteeUserId), {
    v: 1,
    type: "round-invite-toast",
    inviteToken: input.inviteToken,
    roundTitle: input.roundTitle,
    inviterName: input.inviterName,
    inviterAvatar: input.inviterAvatar ?? undefined,
  }).catch((e) => logPublishError("round-invite-toast", e));
}

/** In-app mustard dot + open notifications list refresh (follow / RSVP / invite rows). */
export async function publishNotificationBadgeNudge(userId: string, reason?: string): Promise<void> {
  await publishParfadeMessage(parfadeUserInboxChannel(userId), {
    v: 1,
    type: "inbox-sync",
    notificationBadge: true,
    reason,
  }).catch((e) => logPublishError("notification-badge-nudge", e));
}

