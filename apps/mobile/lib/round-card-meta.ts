/** Shared copy for round list cards (Discover + My Rounds). */

export type RoundListMode = "scheduled" | "planning" | "tournament";

/** API / JSON may surface enum values as loose strings; normalize before branching in list UI. */
export function normalizeRoundListMode(raw: unknown): RoundListMode {
  if (raw === "planning" || raw === "tournament" || raw === "scheduled") return raw;
  if (typeof raw === "string") {
    const m = raw.trim().toLowerCase();
    if (m === "planning" || m === "tournament" || m === "scheduled") return m as RoundListMode;
  }
  return "scheduled";
}

/**
 * Tournament title from list/detail API rows (camelCase from Drizzle; some paths may send snake_case).
 */
export function resolveTournamentTitle(row: {
  tournamentTitle?: string | null;
  tournament_title?: string | null;
}): string | null {
  const v = row.tournamentTitle ?? row.tournament_title;
  if (v == null || typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

/**
 * Single-line tee time for cards and detail, e.g. `Sat, Apr 4 at 9:00am` (viewer's local timezone).
 */
export function formatFriendlyTeeDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const datePart = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timePart = d
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(/\s/g, "")
    .toLowerCase();
  return `${datePart} at ${timePart}`;
}

/** Extract the time windows array from a round object that may have either or both fields. */
export function getTimeWindows(round: {
  preferredTimeWindows?: string[] | null;
  preferredTimeWindow?: string | string[] | null;
}): string[] | null {
  if (round.preferredTimeWindows?.length) return round.preferredTimeWindows;
  const tw = round.preferredTimeWindow;
  if (!tw) return null;
  if (Array.isArray(tw)) return tw.length > 0 ? tw : null;
  return [tw];
}

const LABEL: Record<string, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  twilight: "Twilight",
};

function cap(slot: unknown): string {
  if (typeof slot !== "string" || !slot) return "Anytime";
  return LABEL[slot] ?? slot.charAt(0).toUpperCase() + slot.slice(1);
}

export function formatPlanningWindow(
  window: unknown[] | string | null | undefined,
) {
  if (!window) return "Anytime";
  const arr = Array.isArray(window) ? window.filter((s): s is string => typeof s === "string") : [window];
  if (arr.length === 0 || arr.length >= 3) return "Anytime";
  if (arr.length === 1) return cap(arr[0]);
  return arr.map(cap).join(" or ");
}

/**
 * Scheduled rounds: when `teeTime` is set, date and time must come from the **same** instant.
 * Mixing `targetDate` / effectiveDate for the date with `teeTime` for the clock can show the
 * wrong time (e.g. tee after local midnight vs targetDate still "yesterday").
 */
export function formatScheduledCardMeta(effectiveDateIso: string, teeTime: string | null) {
  if (teeTime) {
    const d = new Date(teeTime);
    if (!Number.isNaN(d.getTime())) {
      return formatFriendlyTeeDateTime(teeTime);
    }
  }
  const datePart = new Date(effectiveDateIso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${datePart} • time TBD`;
}

/** Mine rounds list + notifications: one label for when the round happens. */
export function formatMineRoundWhenLabel(round: {
  mode: "scheduled" | "planning" | "tournament";
  teeTime: string | null;
  targetDate: string;
  preferredTimeWindow?: string | null;
  preferredTimeWindows?: string[] | null;
}): string {
  if (round.mode === "planning") {
    return formatPlanningWindow(getTimeWindows(round));
  }
  if ((round.mode === "scheduled" || round.mode === "tournament") && round.teeTime) {
    const d = new Date(round.teeTime);
    if (!Number.isNaN(d.getTime())) {
      return formatFriendlyTeeDateTime(round.teeTime);
    }
  }
  const effectiveDate = new Date(round.teeTime ?? round.targetDate);
  const dateText = effectiveDate.toLocaleDateString();
  return `${dateText} • ${formatPlanningWindow(getTimeWindows(round))}`;
}

export function formatPlanningHeaderDate(targetDateIso: string) {
  return new Date(targetDateIso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
