/** App-scoped Ably channel names (v1). Keep in sync with `apps/mobile/lib/parfade-ably-channels.ts`. */
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

/** Ably capability resource pattern (subscribe to any profile fanout channel). */
export function parfadeProfileChannelsCapabilityPattern(): string {
  return `${PARFADE_ABLY_NS}:profile:*`;
}
