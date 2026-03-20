import type { DiscoverRound, MineRound, RoundDetails } from "../types/round";

export type RoundListsRefreshPayload = {
  /** When present, list/detail UIs merge this before refetch completes. */
  optimistic?: OptimisticRoundListPatch;
};

export type OptimisticRoundListPatch = {
  roundId: string;
  inviteToken: string;
  mode: "planning" | "scheduled";
  preferredTimeWindow: "morning" | "afternoon" | "twilight" | null;
  planningLocation: string | null;
  courseName: string;
  courseId: string | null;
  teeTime: string | null;
  targetDate: string;
  effectiveDate: string;
  totalSpots: number;
  visibility: "private" | "public";
  joinPolicy: "instant" | "approval";
  customImageUrl: string | null;
};

type Listener = (payload: RoundListsRefreshPayload) => void;
const listeners = new Set<Listener>();

export function emitRoundListsShouldRefresh(payload: RoundListsRefreshPayload = {}) {
  listeners.forEach((l) => {
    try {
      l(payload);
    } catch {
      // ignore subscriber errors
    }
  });
}

export function subscribeRoundListsRefresh(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function matchesPatch(row: { id: string; inviteToken: string }, p: OptimisticRoundListPatch) {
  return row.id === p.roundId || row.inviteToken === p.inviteToken;
}

export function applyOptimisticToDiscoverRound(
  row: DiscoverRound,
  p: OptimisticRoundListPatch,
): DiscoverRound {
  if (!matchesPatch(row, p)) return row;
  const confirmed = row.confirmedPlayers.length;
  return {
    ...row,
    mode: p.mode,
    preferredTimeWindow: p.preferredTimeWindow,
    planningLocation: p.planningLocation,
    courseName: p.mode === "scheduled" ? p.courseName || row.courseName : row.courseName,
    teeTime: p.teeTime,
    targetDate: p.targetDate,
    effectiveDate: p.effectiveDate,
    totalSpots: p.totalSpots,
    spotsRemaining: Math.max(0, p.totalSpots - confirmed),
    joinPolicy: p.joinPolicy,
  };
}

export function applyOptimisticToMineRound(row: MineRound, p: OptimisticRoundListPatch): MineRound {
  if (!matchesPatch(row, p)) return row;
  return {
    ...row,
    mode: p.mode,
    preferredTimeWindow: p.preferredTimeWindow,
    planningLocation: p.planningLocation,
    courseName:
      p.mode === "scheduled" ? (p.courseName || row.courseName) : (row.courseName ?? null),
    teeTime: p.teeTime,
    targetDate: p.targetDate,
    totalSpots: p.totalSpots,
    joinPolicy: p.joinPolicy,
  };
}

export function applyOptimisticToRoundDetails(
  row: RoundDetails,
  p: OptimisticRoundListPatch,
): RoundDetails {
  if (!matchesPatch(row, p)) return row;
  return {
    ...row,
    mode: p.mode,
    preferredTimeWindow: p.preferredTimeWindow,
    planningLocation: p.planningLocation,
    courseName: p.mode === "scheduled" ? p.courseName || row.courseName : row.courseName,
    courseId: p.courseId ?? row.courseId,
    teeTime: p.teeTime,
    targetDate: p.targetDate,
    totalSpots: p.totalSpots,
    visibility: p.visibility,
    joinPolicy: p.joinPolicy,
    customImageUrl: p.customImageUrl,
    spotsRemaining: Math.max(0, p.totalSpots - row.confirmedPlayers.length),
  };
}
