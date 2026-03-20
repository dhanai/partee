/** Shared copy for round list cards (Discover + My Rounds). */

export function formatPlanningWindow(
  window: "morning" | "afternoon" | "twilight" | null | undefined,
) {
  if (!window) return "Time TBD";
  return window.charAt(0).toUpperCase() + window.slice(1);
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
