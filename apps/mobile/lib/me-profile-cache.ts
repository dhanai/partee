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

export function getCachedMeProfile(): MeProfile | null {
  if (!meCacheEntry) return null;
  const isFresh = Date.now() - meCacheEntry.updatedAt < ME_CACHE_TTL_MS;
  if (!isFresh) return null;
  return meCacheEntry.data;
}

export function setCachedMeProfile(data: MeProfile) {
  meCacheEntry = {
    data,
    updatedAt: Date.now(),
  };
}

export function clearCachedMeProfile() {
  meCacheEntry = null;
}
