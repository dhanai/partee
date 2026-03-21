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

/**
 * Strip trailing venue boilerplate for compact push copy, e.g.
 * "Alhambra Golf Course" → "Alhambra", "Augusta National Golf Club" → "Augusta National".
 * If stripping would leave nothing, returns the original trimmed string.
 */
export function simplifyVenueNameForPush(name: string): string {
  const original = name.trim().replace(/\s+/g, " ");
  if (!original) return original;

  const trailingPatterns = [
    /\s+golf\s+&\s+country\s+club$/i,
    /\s+golf\s+and\s+country\s+club$/i,
    /\s+country\s+club$/i,
    /\s+golf\s+course$/i,
    /\s+golf\s+club$/i,
    /\s+golf\s+links$/i,
    /\s+municipal\s+golf\s+course$/i,
    /\s+public\s+golf\s+course$/i,
    /\s+golf\s+center$/i,
    /\s+golf\s+resort$/i,
    /\s+driving\s+range$/i,
    /\s+g\.c\.?$/i,
    /\s+gc$/i,
    /\s+cc$/i,
  ];

  let s = original;
  let prev = "";
  while (s !== prev) {
    prev = s;
    for (const re of trailingPatterns) {
      s = s.replace(re, "").trim();
    }
    s = s.replace(/\s*,\s*$/, "").trim();
  }

  const noLeadingThe = s.replace(/^(the)\s+/i, "").trim();
  if (noLeadingThe.length > 0) s = noLeadingThe;

  return s.length > 0 ? s : original;
}

/** e.g. "Mar 22"; adds year when not the current calendar year. */
export function formatChatPushDateShort(
  teeTime: Date | null,
  targetDate: Date,
  mode: "planning" | "scheduled",
): string {
  const d = mode === "scheduled" && teeTime != null ? teeTime : targetDate;
  const date = d instanceof Date ? d : new Date(d);
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  const monthDay = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (sameYear) return monthDay;
  return `${monthDay} ${date.getFullYear()}`;
}

/** One-line context for chat pushes, e.g. "Alhambra Mar 22" or "Scottsdale Mar 22". */
export function formatChatPushTitleLine(input: {
  courseName: string | null;
  planningLocation: string | null;
  mode: "planning" | "scheduled";
  teeTime: Date | null;
  targetDate: Date;
}): string {
  const datePart = formatChatPushDateShort(input.teeTime, input.targetDate, input.mode);
  const c = input.courseName?.trim();
  if (c) {
    const venue = simplifyVenueNameForPush(c);
    return `${venue} ${datePart}`.trim();
  }
  const p = input.planningLocation?.trim();
  if (p) {
    const comma = p.indexOf(",");
    const venue = comma > 0 ? p.slice(0, comma).trim().replace(/\s+/g, " ") : p;
    return `${venue} ${datePart}`.trim();
  }
  return `Chat ${datePart}`.trim();
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
