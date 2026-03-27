export type MeProfile = {
  id: string;
  name: string;
  email: string | null;
  avatar: string | null;
  handicap: string | null;
  location: string | null;
  homeCourse: string | null;
  followersCount?: number;
  followingCount?: number;
};

type MeCacheEntry = {
  data: MeProfile;
  updatedAt: number;
};

const ME_CACHE_TTL_MS = 1000 * 60 * 3;
let meCacheEntry: MeCacheEntry | null = null;
const listeners = new Set<(profile: MeProfile) => void>();

export function getCachedMeProfile(): MeProfile | null {
  return meCacheEntry?.data ?? null;
}

export function isMeProfileStale(): boolean {
  if (!meCacheEntry) return true;
  return Date.now() - meCacheEntry.updatedAt >= ME_CACHE_TTL_MS;
}

export function setCachedMeProfile(data: MeProfile) {
  meCacheEntry = {
    data,
    updatedAt: Date.now(),
  };
  listeners.forEach((fn) => fn(data));
}

export function clearCachedMeProfile() {
  meCacheEntry = null;
}

export function subscribeMeProfile(fn: (profile: MeProfile) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
