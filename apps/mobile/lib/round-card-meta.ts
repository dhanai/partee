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
