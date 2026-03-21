import Ably from "ably";
import {
  parfadeDiscoverChannel,
  parfadeProfileChannel,
  parfadeRoundDetailChannel,
  parfadeUserInboxChannel,
} from "@/lib/parfade-ably-channels";
import type { ParfadeRealtimeMessageV1 } from "@/lib/parfade-ably-messages";
import { listRoundChatPushRecipientUserIds } from "@/lib/round-chat-access";
import {
  formatChatPushTitleLine,
  formatInviterFirstLastInitial,
} from "@/lib/round-invite-push-message";

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

const CHAT_TOAST_PREVIEW_MAX = 100;

/** In-app mustard dot + open notifications list refresh (follow / RSVP / invite rows). */
export function publishNotificationBadgeNudge(userId: string, reason?: string): void {
  void publishParfadeMessage(parfadeUserInboxChannel(userId), {
    v: 1,
    type: "inbox-sync",
    notificationBadge: true,
    reason,
  }).catch((e) => logPublishError("notification-badge-nudge", e));
}

/**
 * Instagram-style in-app banner for other group-chat participants (host + confirmed).
 * Distinct from push: works while the app is foregrounded.
 */
export function publishGroupChatToastFanout(input: {
  roundId: string;
  inviteToken: string;
  senderUserId: string;
  senderName: string;
  messageBody: string;
  courseName: string | null;
  planningLocation: string | null;
  mode: "planning" | "scheduled";
  teeTime: Date | null;
  targetDate: Date;
}): void {
  void (async () => {
    const recipientIds = await listRoundChatPushRecipientUserIds(
      input.roundId,
      input.senderUserId,
    );
    if (recipientIds.length === 0) return;

    const roundTitle = formatChatPushTitleLine({
      courseName: input.courseName,
      planningLocation: input.planningLocation,
      mode: input.mode,
      teeTime: input.teeTime,
      targetDate: input.targetDate,
    });
    const senderLabel = formatInviterFirstLastInitial(input.senderName);
    const raw = input.messageBody.trim();
    const bodyPreview =
      raw.length > CHAT_TOAST_PREVIEW_MAX
        ? `${raw.slice(0, CHAT_TOAST_PREVIEW_MAX - 1)}…`
        : raw;
    const token = input.inviteToken.trim();

    for (const uid of recipientIds) {
      void publishParfadeMessage(parfadeUserInboxChannel(uid), {
        v: 1,
        type: "group-chat-toast",
        inviteToken: token,
        roundTitle,
        senderLabel,
        bodyPreview,
      }).catch((e) => logPublishError(`group-chat-toast ${uid}`, e));
    }
  })().catch((e) => logPublishError("group-chat-toast fanout", e));
}
