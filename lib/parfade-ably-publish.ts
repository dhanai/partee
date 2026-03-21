import Ably from "ably";
import {
  parfadeDiscoverChannel,
  parfadeProfileChannel,
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
