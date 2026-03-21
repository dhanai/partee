/** Must match `lib/parfade-ably-channels.ts` in the Next app. */
export const PARFADE_ABLY_NS = "parfade:v1";

export function parfadeDiscoverChannel(): string {
  return `${PARFADE_ABLY_NS}:discover`;
}

export function parfadeUserInboxChannel(userId: string): string {
  return `${PARFADE_ABLY_NS}:user:${userId}`;
}

export function parfadeProfileChannel(userId: string): string {
  return `${PARFADE_ABLY_NS}:profile:${userId}`;
}

export function parfadeProfileChannelsCapabilityPattern(): string {
  return `${PARFADE_ABLY_NS}:profile:*`;
}
