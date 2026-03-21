/** Mirrors `lib/parfade-ably-messages.ts` on the server. */
export type ParfadeRealtimeMessageV1 =
  | { v: 1; type: "discover-refresh"; reason?: string }
  | { v: 1; type: "inbox-sync"; roundLists?: boolean; notificationBadge?: boolean; reason?: string }
  | { v: 1; type: "profile-updated"; userId: string };

export function parseParfadeRealtimeMessage(data: unknown): ParfadeRealtimeMessageV1 | null {
  let raw: unknown = data;
  if (typeof data === "string") {
    try {
      raw = JSON.parse(data) as unknown;
    } catch {
      return null;
    }
  }
  if (raw === null || typeof raw !== "object") return null;
  const o = raw as { v?: unknown; type?: unknown; userId?: unknown };
  if (o.v !== 1 || typeof o.type !== "string") return null;
  if (o.type === "discover-refresh") {
    const r = (raw as { reason?: unknown }).reason;
    return {
      v: 1,
      type: "discover-refresh",
      reason: typeof r === "string" ? r : undefined,
    };
  }
  if (o.type === "inbox-sync") {
    const m = raw as {
      roundLists?: unknown;
      notificationBadge?: unknown;
      reason?: unknown;
    };
    return {
      v: 1,
      type: "inbox-sync",
      roundLists: m.roundLists === true,
      notificationBadge: m.notificationBadge === true,
      reason: typeof m.reason === "string" ? m.reason : undefined,
    };
  }
  if (o.type === "profile-updated" && typeof o.userId === "string") {
    return { v: 1, type: "profile-updated", userId: o.userId };
  }
  return null;
}
