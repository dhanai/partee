/** Shared copy for round list cards (Discover + My Rounds). */

/** Extract the time windows array from a round object that may have either or both fields. */
export function getTimeWindows(round: {
  preferredTimeWindows?: string[] | null;
  preferredTimeWindow?: string | null;
}): string[] | null {
  if (round.preferredTimeWindows?.length) return round.preferredTimeWindows;
  if (round.preferredTimeWindow) return [round.preferredTimeWindow];
  return null;
}

const LABEL: Record<string, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  twilight: "Twilight",
};

function cap(slot: string): string {
  return LABEL[slot] ?? slot.charAt(0).toUpperCase() + slot.slice(1);
}

export function formatPlanningWindow(
  window: string[] | null | undefined,
) {
  if (!window || window.length === 0 || window.length >= 3) return "Time TBD";
  if (window.length === 1) return cap(window[0]!);
  return window.map(cap).join(" or ");
}

export function formatScheduledCardMeta(effectiveDateIso: string, teeTime: string | null) {
  const datePart = new Date(effectiveDateIso).toLocaleDateString();
  const timePart = teeTime
    ? `at ${new Date(teeTime).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })}`
    : "• time TBD";
  return `${datePart} ${timePart}`;
}

export function formatPlanningHeaderDate(targetDateIso: string) {
  return new Date(targetDateIso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
