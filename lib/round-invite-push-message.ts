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

/** Course / area label for prose, e.g. "Pebble Beach" or "the round". */
export function formatVenueLabel(input: {
  courseName: string | null;
  planningLocation: string | null;
}): string {
  const c = input.courseName?.trim();
  if (c) return c;
  const p = input.planningLocation?.trim();
  if (p) return p;
  return "the round";
}

/** Short label for notification titles (never "the round" — use "Round"). */
export function formatRoundShortLabel(input: {
  courseName: string | null;
  planningLocation: string | null;
}): string {
  const c = input.courseName?.trim();
  if (c) return c;
  const p = input.planningLocation?.trim();
  if (p) return p;
  return "Round";
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

function formatWhenClauseForPush(input: {
  mode: "planning" | "scheduled";
  teeTime: Date | null;
  targetDate: Date;
}): string {
  const datePart = formatRoundInviteDateForPush(input.teeTime, input.targetDate, input.mode);
  if (input.mode === "scheduled" && input.teeTime != null) {
    const t = input.teeTime instanceof Date ? input.teeTime : new Date(input.teeTime);
    const timePart = t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return ` on ${datePart} at ${timePart}`;
  }
  return ` on ${datePart}`;
}

export function buildRoundInvitePushBody(input: {
  inviterDisplayName: string;
  teeTime: Date | null;
  targetDate: Date;
  mode: "planning" | "scheduled";
  courseName: string | null;
  planningLocation: string | null;
}): string {
  const who = formatInviterFirstLastInitial(input.inviterDisplayName);
  const dateStr = formatRoundInviteDateForPush(input.teeTime, input.targetDate, input.mode);

  if (input.mode === "planning") {
    return `${who} wants to know if you can play a round on ${dateStr}.`;
  }

  const venue = formatVenueLabel({
    courseName: input.courseName,
    planningLocation: input.planningLocation,
  });
  if (input.teeTime != null) {
    const t = input.teeTime instanceof Date ? input.teeTime : new Date(input.teeTime);
    const timeStr = t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return `${who} is inviting you to play a round at ${venue} on ${dateStr} at ${timeStr}.`;
  }
  return `${who} is inviting you to play a round at ${venue} on ${dateStr}.`;
}

export function buildHostRsvpNotificationCopy(input: {
  guestName: string;
  courseName: string | null;
  planningLocation: string | null;
  mode: "planning" | "scheduled";
  teeTime: Date | null;
  targetDate: Date;
  spotStatus: "confirmed" | "requested" | "declined";
}): { title: string; body: string } {
  const venue = formatVenueLabel({
    courseName: input.courseName,
    planningLocation: input.planningLocation,
  });

  if (input.spotStatus === "declined") {
    const who = formatInviterFirstLastInitial(input.guestName);
    return {
      title: "Invite declined",
      body: `${who} declined your invite to ${venue}.`,
    };
  }

  const who = formatInviterFirstLastInitial(input.guestName);
  const when = formatWhenClauseForPush({
    mode: input.mode,
    teeTime: input.teeTime,
    targetDate: input.targetDate,
  });

  if (input.spotStatus === "requested") {
    return {
      title: "Join request",
      body: `${who} asked to join ${venue}${when}.`,
    };
  }

  return {
    title: "Spot claimed",
    body: `${who} is in for ${venue}${when}.`,
  };
}
