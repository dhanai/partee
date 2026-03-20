/** "Jordan Smith" → "Jordan S."; single names unchanged. */
export function formatInviterFirstLastInitial(name: string): string {
  const t = name.trim();
  if (!t) return "Someone";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Someone";
  const first = parts[0]!;
  if (parts.length === 1) return first;
  const last = parts[parts.length - 1]!;
  const initial = last.charAt(0).toUpperCase();
  return `${first} ${initial}.`;
}

/** Short date for push copy, e.g. "Thu, Mar 21" (adds year if not this year). */
export function formatRoundInviteDateForPush(
  teeTime: Date | null,
  targetDate: Date,
  mode: "planning" | "scheduled",
): string {
  const d = mode === "scheduled" && teeTime != null ? teeTime : targetDate;
  const date = d instanceof Date ? d : new Date(d);
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" as const }),
  });
}

export function buildRoundInvitePushBody(input: {
  inviterDisplayName: string;
  teeTime: Date | null;
  targetDate: Date;
  mode: "planning" | "scheduled";
}): string {
  const who = formatInviterFirstLastInitial(input.inviterDisplayName);
  const when = formatRoundInviteDateForPush(input.teeTime, input.targetDate, input.mode);
  return `${who} has invited you to a round on ${when}.`;
}
