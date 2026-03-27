import { parfadeUserAvatarUrlForDisplay } from "./user-avatar-display";

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
  const raw = meCacheEntry?.data ?? null;
  if (!raw) return null;
  return {
    ...raw,
    avatar: parfadeUserAvatarUrlForDisplay(raw.avatar),
  };
}

export function isMeProfileStale(): boolean {
  if (!meCacheEntry) return true;
  return Date.now() - meCacheEntry.updatedAt >= ME_CACHE_TTL_MS;
}

export function setCachedMeProfile(data: MeProfile) {
  const normalized: MeProfile = {
    ...data,
    avatar: parfadeUserAvatarUrlForDisplay(data.avatar),
  };
  meCacheEntry = {
    data: normalized,
    updatedAt: Date.now(),
  };
  listeners.forEach((fn) => fn(normalized));
}

export function clearCachedMeProfile() {
  meCacheEntry = null;
}

export function subscribeMeProfile(fn: (profile: MeProfile) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
