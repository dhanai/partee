import { apiGet } from "./api";
import { parfadeUserAvatarUrlForDisplay } from "./user-avatar-display";

export type PublicProfile = {
  user: {
    id: string;
    name: string;
    avatar: string | null;
    handicap: string | null;
    location: string | null;
    followVisibility: "public" | "private";
    relationship:
      | "self"
      | "none"
      | "requested_by_viewer"
      | "requested_to_viewer"
      | "following"
      | "followed_by"
      | "mutual";
    followersCount: number;
    followingCount: number;
  };
  friends: Array<{
    id: string;
    name: string;
    avatar: string | null;
    handicap: string | null;
  }>;
};

type CacheEntry = {
  data: PublicProfile;
  updatedAt: number;
};

const CACHE_TTL_MS = 1000 * 60 * 3;
const profileCache = new Map<string, CacheEntry>();
const inflightPrefetch = new Map<string, Promise<void>>();

function isFresh(entry: CacheEntry | undefined) {
  if (!entry) return false;
  return Date.now() - entry.updatedAt < CACHE_TTL_MS;
}

function normalizePublicProfile(p: PublicProfile): PublicProfile {
  return {
    ...p,
    user: { ...p.user, avatar: parfadeUserAvatarUrlForDisplay(p.user.avatar) },
    friends: p.friends.map((f) => ({
      ...f,
      avatar: parfadeUserAvatarUrlForDisplay(f.avatar),
    })),
  };
}

export function clearPublicProfileCache() {
  profileCache.clear();
  inflightPrefetch.clear();
}

export function getCachedPublicProfile(userId: string): PublicProfile | null {
  const entry = profileCache.get(userId);
  if (!entry) return null;
  return normalizePublicProfile(entry.data);
}

export function hasFreshPublicProfile(userId: string): boolean {
  return isFresh(profileCache.get(userId));
}

export function setCachedPublicProfile(profile: PublicProfile) {
  profileCache.set(profile.user.id, {
    data: normalizePublicProfile(profile),
    updatedAt: Date.now(),
  });
}

export function updateCachedPublicProfile(
  userId: string,
  updater: (current: PublicProfile) => PublicProfile,
) {
  const entry = profileCache.get(userId);
  if (!entry) return;
  setCachedPublicProfile(updater(normalizePublicProfile(entry.data)));
}

export async function fetchPublicProfileAndCache(
  userId: string,
  token: string | null,
): Promise<PublicProfile> {
  const profile = await apiGet<PublicProfile>(`/api/users/${userId}/profile`, token);
  const normalized = normalizePublicProfile(profile);
  setCachedPublicProfile(normalized);
  return normalized;
}

export function prefetchPublicProfile(
  userId: string,
  getToken: () => Promise<string | null>,
) {
  if (hasFreshPublicProfile(userId)) return;
  const existing = inflightPrefetch.get(userId);
  if (existing) return;
  const run = (async () => {
    const token = await getToken();
    await fetchPublicProfileAndCache(userId, token);
  })()
    .catch(() => {
      // Best-effort prefetch; ignore transient failures.
    })
    .finally(() => {
      inflightPrefetch.delete(userId);
    });
  inflightPrefetch.set(userId, run);
}
