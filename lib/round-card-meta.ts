/** Aligned with `apps/mobile/lib/round-card-meta.ts`. */

export function formatPlanningWindow(
  window: "morning" | "afternoon" | "twilight" | null | undefined,
) {
  if (!window) return "Time TBD";
  return window.charAt(0).toUpperCase() + window.slice(1);
}

export function formatScheduledCardMeta(effectiveDate: Date | string, teeTime: Date | string | null) {
  const datePart = new Date(effectiveDate).toLocaleDateString();
  const timePart = teeTime
    ? `at ${new Date(teeTime).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })}`
    : "• time TBD";
  return `${datePart} ${timePart}`;
}

export function formatPlanningHeaderDate(targetDate: Date | string) {
  return new Date(targetDate).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
