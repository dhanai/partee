import { resolveRoundImageUrl } from "@/lib/round-images";
import { timeWindowResponseFields } from "@/lib/round-time-window-compat";

/**
 * Serialized `RoundListHint` for navigation — matches bootstrap in `round-details-cache`
 * so the round screen paints the same schedule/image as the live round row.
 */
export function buildRoundNavHintJson(input: {
  id: string;
  inviteToken: string;
  mode: "planning" | "scheduled";
  courseName: string | null;
  teeTime: Date | null;
  targetDate: Date;
  preferredTimeWindow: string[] | null;
  planningLocation: string | null;
  joinPolicy: "instant" | "approval";
  totalSpots: number;
  customImageUrl: string | null;
  courseMetadata: Record<string, unknown> | null;
  hostId: string;
  hostName: string;
  hostAvatar: string | null;
}): string {
  const tw = timeWindowResponseFields(input.preferredTimeWindow);
  const imageUrl = resolveRoundImageUrl({
    customImageUrl: input.customImageUrl ?? undefined,
    courseMetadata: input.courseMetadata,
  });
  const hint = {
    id: input.id,
    inviteToken: input.inviteToken,
    mode: input.mode,
    courseName: (input.courseName ?? "").trim() || "Round",
    imageUrl,
    teeTime: input.teeTime?.toISOString() ?? null,
    targetDate: input.targetDate.toISOString(),
    preferredTimeWindow: tw.preferredTimeWindow,
    preferredTimeWindows: tw.preferredTimeWindows,
    planningLocation: input.planningLocation,
    joinPolicy: input.joinPolicy,
    totalSpots: input.totalSpots,
    hostId: input.hostId,
    hostName: input.hostName,
    hostAvatar: input.hostAvatar,
    confirmedPlayers: [] as Array<{ id: string; name: string; avatar: string | null }>,
  };
  return JSON.stringify(hint);
}
