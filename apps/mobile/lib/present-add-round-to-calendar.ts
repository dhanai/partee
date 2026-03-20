import * as Calendar from "expo-calendar";
import type { Event as CalendarEvent } from "expo-calendar";
import { Alert, Platform } from "react-native";
import type { RoundDetails } from "../types/round";
import { formatPlanningWindow } from "./round-card-meta";

const ROUND_DURATION_MS = 4.5 * 60 * 60 * 1000;

function planningWindowHours(
  window: RoundDetails["preferredTimeWindow"],
): { startH: number; endH: number } {
  switch (window) {
    case "morning":
      return { startH: 8, endH: 12 };
    case "afternoon":
      return { startH: 12, endH: 17 };
    case "twilight":
      return { startH: 17, endH: 20 };
    default:
      return { startH: 9, endH: 13 };
  }
}

function eventTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  } catch {
    return "UTC";
  }
}

function buildCalendarEventData(
  round: RoundDetails,
): Omit<Partial<CalendarEvent>, "id"> {
  const timeZone = eventTimeZone();

  if (round.mode === "scheduled" && round.teeTime) {
    const start = new Date(round.teeTime);
    const end = new Date(start.getTime() + ROUND_DURATION_MS);
    return {
      title: `Golf — ${round.courseName}`,
      location: round.courseName,
      notes: `Partee round · Host: ${round.hostName}`,
      startDate: start,
      endDate: end,
      allDay: false,
      timeZone,
    };
  }

  const day = new Date(round.targetDate);
  day.setHours(0, 0, 0, 0);
  const { startH, endH } = planningWindowHours(round.preferredTimeWindow);
  const start = new Date(day);
  start.setHours(startH, 0, 0, 0);
  const end = new Date(day);
  end.setHours(endH, 0, 0, 0);

  const windowLabel = formatPlanningWindow(round.preferredTimeWindow);
  const loc = round.planningLocation?.trim();
  const isPlanning = round.mode === "planning";
  const notesLines = isPlanning
    ? [
        "Partee round (planning — tee time may change when finalized).",
        `Preferred: ${windowLabel}`,
        loc ? `Where: ${loc}` : null,
        `Host: ${round.hostName}`,
      ]
    : [
        "Partee round (tee time not set in calendar — check the app for the exact tee time).",
        `Host: ${round.hostName}`,
      ];

  return {
    title: isPlanning ? `Golf — planning (${windowLabel})` : `Golf — ${round.courseName}`,
    location: loc || undefined,
    notes: notesLines.filter(Boolean).join("\n"),
    startDate: start,
    endDate: end,
    allDay: false,
    timeZone,
  };
}

export async function presentAddRoundToCalendar(round: RoundDetails): Promise<void> {
  if (Platform.OS === "web") {
    Alert.alert(
      "Calendar",
      "Adding rounds to your calendar is available in the iOS and Android apps.",
    );
    return;
  }

  const available = await Calendar.isAvailableAsync();
  if (!available) {
    Alert.alert("Calendar", "Calendar isn’t available on this device.");
    return;
  }

  try {
    await Calendar.createEventInCalendarAsync(buildCalendarEventData(round));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Couldn’t open the calendar.";
    Alert.alert("Calendar", msg);
  }
}
