import { formatPlanningWindow } from "./round-card-meta";

/** Mirrors server `formatInviterFirstLastInitial` — keep in sync with lib/round-invite-push-message.ts */
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

export type RoundRsvpNotificationMeta = {
  mode: "planning" | "scheduled" | "tournament";
  teeTimeIso: string | null;
  targetDateIso: string;
  venueLabel: string;
  spotStatus: "confirmed" | "requested" | "declined";
  /** Live round preferred windows — updates when host edits the round */
  preferredTimeWindows?: string[] | null;
};

/** Device-local calendar date (weekday, month, day) matching server push intent without UTC skew. */
function formatRoundInviteDateLocal(
  teeTimeIso: string | null,
  targetDateIso: string,
  mode: "planning" | "scheduled",
): string {
  const d =
    mode === "scheduled" && teeTimeIso != null
      ? new Date(teeTimeIso)
      : new Date(targetDateIso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" as const }),
  });
}

function formatWhenClauseLocal(meta: RoundRsvpNotificationMeta): string {
  const { mode, teeTimeIso, targetDateIso, preferredTimeWindows } = meta;

  if ((mode === "scheduled" || mode === "tournament") && teeTimeIso) {
    const d = new Date(teeTimeIso);
    if (!Number.isNaN(d.getTime())) {
      const now = new Date();
      const sameYear = d.getFullYear() === now.getFullYear();
      const datePart = d.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        ...(sameYear ? {} : { year: "numeric" as const }),
      });
      const timePart = d.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
      return ` on ${datePart} at ${timePart}`;
    }
  }

  if (mode === "planning") {
    const d = new Date(targetDateIso);
    if (Number.isNaN(d.getTime())) return "";
    const now = new Date();
    const sameYear = d.getFullYear() === now.getFullYear();
    const datePart = d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" as const }),
    });
    const win = formatPlanningWindow(preferredTimeWindows ?? null);
    if (win && win !== "Anytime") return ` on ${datePart} · ${win}`;
    return ` on ${datePart}`;
  }

  const datePart = formatRoundInviteDateLocal(teeTimeIso, targetDateIso, mode);
  return datePart ? ` on ${datePart}` : "";
}

/** Rebuild host RSVP notification body using the viewer's local timezone (stored body uses server UTC). */
export function formatHostRsvpBodyLocal(guestName: string, meta: RoundRsvpNotificationMeta): string {
  const venue = meta.venueLabel;
  if (meta.spotStatus === "declined") {
    const who = formatInviterFirstLastInitial(guestName);
    return `${who} declined your invite to ${venue}.`;
  }
  const who = formatInviterFirstLastInitial(guestName);
  const when = formatWhenClauseLocal(meta);
  if (meta.spotStatus === "requested") {
    return `${who} asked to join ${venue}${when}.`;
  }
  return `${who} is in for ${venue}${when}.`;
}
