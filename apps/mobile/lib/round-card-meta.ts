/** Shared copy for round list cards (Discover + My Rounds). */

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
      const datePart = d.toLocaleDateString();
      const timePart = d.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
      return `${datePart} at ${timePart}`;
    }
  }
  const datePart = new Date(effectiveDateIso).toLocaleDateString();
  return `${datePart} • time TBD`;
}

/** Mine rounds list + notifications: one label for when the round happens. */
export function formatMineRoundWhenLabel(round: {
  mode: "scheduled" | "planning";
  teeTime: string | null;
  targetDate: string;
  preferredTimeWindow?: string | null;
  preferredTimeWindows?: string[] | null;
}): string {
  if (round.mode === "planning") {
    return formatPlanningWindow(getTimeWindows(round));
  }
  if (round.mode === "scheduled" && round.teeTime) {
    const d = new Date(round.teeTime);
    if (!Number.isNaN(d.getTime())) {
      const dateText = d.toLocaleDateString();
      const timeText = d.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
      return `${dateText} at ${timeText}`;
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
