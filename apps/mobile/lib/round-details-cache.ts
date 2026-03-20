import { Image } from "expo-image";
import { apiGet, toAbsoluteUrl } from "./api";
import type { DiscoverRound, MineRound, RoundDetails } from "../types/round";

type RoundResponse = { round: RoundDetails };

/** Serialized on navigation so the details screen can paint before GET /api/rounds/:token returns. */
export type RoundListHint = {
  id: string;
  inviteToken: string;
  mode: "scheduled" | "planning";
  courseName: string;
  imageUrl: string;
  teeTime: string | null;
  targetDate: string;
  preferredTimeWindow: "morning" | "afternoon" | "twilight" | null;
  planningLocation: string | null;
  joinPolicy: "instant" | "approval";
  totalSpots: number;
  hostId?: string;
  hostName?: string;
  hostAvatar?: string | null;
  confirmedPlayers: Array<{ id: string; name: string; avatar: string | null }>;
  spotsRemaining?: number;
  spotStatus?: string;
};

const CACHE_TTL_MS = 1000 * 60 * 3;
const cache = new Map<string, { data: RoundDetails; updatedAt: number }>();
const inflightPrefetch = new Map<string, Promise<void>>();

function isFresh(entry: { updatedAt: number } | undefined) {
  if (!entry) return false;
  return Date.now() - entry.updatedAt < CACHE_TTL_MS;
}

export function getCachedRoundDetails(inviteToken: string): RoundDetails | null {
  const entry = cache.get(inviteToken);
  if (!entry) return null;
  return entry.data;
}

export function hasFreshRoundDetails(inviteToken: string): boolean {
  return isFresh(cache.get(inviteToken));
}

export function setCachedRoundDetails(round: RoundDetails) {
  cache.set(round.inviteToken, {
    data: round,
    updatedAt: Date.now(),
  });
}

export function buildRoundListHint(round: DiscoverRound | MineRound): string {
  const totalSpots = round.totalSpots ?? 4;
  const hint: RoundListHint = {
    id: round.id,
    inviteToken: round.inviteToken,
    mode: round.mode,
    courseName: (round.courseName ?? "").trim() || "Round",
    imageUrl: round.imageUrl,
    teeTime: round.teeTime ?? null,
    targetDate: round.targetDate,
    preferredTimeWindow: round.preferredTimeWindow ?? null,
    planningLocation: round.planningLocation ?? null,
    joinPolicy: round.joinPolicy,
    totalSpots,
    confirmedPlayers: round.confirmedPlayers ?? [],
  };
  if ("hostId" in round && round.hostId) hint.hostId = round.hostId;
  if ("hostName" in round && round.hostName) hint.hostName = round.hostName;
  if ("hostAvatar" in round) hint.hostAvatar = round.hostAvatar;
  if ("spotsRemaining" in round && round.spotsRemaining != null) {
    hint.spotsRemaining = round.spotsRemaining;
  }
  if ("spotStatus" in round && round.spotStatus) {
    hint.spotStatus = round.spotStatus;
  }
  return JSON.stringify(hint);
}

export function parseRoundListHint(raw: string | undefined): RoundListHint | null {
  if (!raw || raw.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(raw) as RoundListHint;
    if (
      !parsed ||
      typeof parsed.id !== "string" ||
      typeof parsed.inviteToken !== "string" ||
      typeof parsed.imageUrl !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function hintToRoundDetails(h: RoundListHint): RoundDetails {
  const players = h.confirmedPlayers ?? [];
  const totalSpots = h.totalSpots;
  const remaining = h.spotsRemaining ?? Math.max(0, totalSpots - players.length);
  return {
    id: h.id,
    inviteToken: h.inviteToken,
    mode: h.mode,
    preferredTimeWindow: h.preferredTimeWindow,
    planningLocation: h.planningLocation,
    courseName: h.courseName,
    teeTime: h.teeTime,
    targetDate: h.targetDate,
    visibility: "public",
    totalSpots,
    status: "forming",
    joinPolicy: h.joinPolicy,
    hostId: h.hostId ?? "",
    hostName: h.hostName ?? "",
    hostAvatar: h.hostAvatar ?? null,
    imageUrl: h.imageUrl,
    confirmedCount: players.length,
    confirmedPlayers: players,
    declinedPlayers: [],
    spotsRemaining: remaining,
    isHost: false,
    currentUserSpotStatus: h.spotStatus ?? null,
  };
}

function mergeHintOntoCached(cached: RoundDetails, hint: RoundListHint): RoundDetails {
  const players =
    hint.confirmedPlayers.length > 0 ? hint.confirmedPlayers : cached.confirmedPlayers;
  return {
    ...cached,
    courseName: hint.courseName || cached.courseName,
    imageUrl: hint.imageUrl || cached.imageUrl,
    teeTime: hint.teeTime ?? cached.teeTime,
    targetDate: hint.targetDate,
    mode: hint.mode,
    preferredTimeWindow: hint.preferredTimeWindow,
    planningLocation: hint.planningLocation,
    joinPolicy: hint.joinPolicy,
    totalSpots: hint.totalSpots,
    hostId: hint.hostId || cached.hostId,
    hostName: hint.hostName || cached.hostName,
    hostAvatar: hint.hostAvatar !== undefined ? hint.hostAvatar : cached.hostAvatar,
    confirmedPlayers: players,
    confirmedCount: players.length,
    spotsRemaining: hint.spotsRemaining ?? cached.spotsRemaining,
  };
}

/**
 * Same idea as profile bootstrap: list-row hint + optional cache so we can render immediately.
 */
export function computeBootstrapRound(
  inviteToken: string,
  roundHintParam: string | undefined,
): RoundDetails | null {
  const cached = getCachedRoundDetails(inviteToken);
  const hint = parseRoundListHint(roundHintParam);
  if (hint && cached) {
    return mergeHintOntoCached(cached, hint);
  }
  if (hint) {
    return hintToRoundDetails(hint);
  }
  if (cached) {
    return cached;
  }
  return null;
}

export async function fetchRoundDetailsAndCache(
  inviteToken: string,
  token: string | null,
): Promise<RoundDetails> {
  const data = await apiGet<RoundResponse>(`/api/rounds/${inviteToken}`, token);
  setCachedRoundDetails(data.round);
  return data.round;
}

export function prefetchRoundDetails(
  inviteToken: string,
  getToken: () => Promise<string | null>,
) {
  if (hasFreshRoundDetails(inviteToken)) return;
  const existing = inflightPrefetch.get(inviteToken);
  if (existing) return;
  const run = (async () => {
    const authToken = await getToken();
    await fetchRoundDetailsAndCache(inviteToken, authToken);
  })()
    .catch(() => {
      /* best-effort */
    })
    .finally(() => {
      inflightPrefetch.delete(inviteToken);
    });
  inflightPrefetch.set(inviteToken, run);
}

/** Prime the native image cache so the details hero often reuses the bitmap from the list row. */
export function prefetchRoundCoverImage(urlOrPath: string) {
  const trimmed = urlOrPath?.trim();
  if (!trimmed) return;
  const uri = toAbsoluteUrl(trimmed);
  void Image.prefetch(uri, "memory-disk").catch(() => {
    /* ignore */
  });
}

/** Same idea as prefetching a profile before navigation: JSON + cover bitmap. */
export function prefetchRoundOpen(
  inviteToken: string,
  coverUrlOrPath: string,
  getToken: () => Promise<string | null>,
) {
  prefetchRoundDetails(inviteToken, getToken);
  prefetchRoundCoverImage(coverUrlOrPath);
}
