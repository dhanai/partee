import { colors } from "./theme";

export type PlanningTimeWindow = "morning" | "afternoon" | "twilight" | null | undefined;

export type PlanningWindowIcon =
  | "sunny-outline"
  | "partly-sunny-outline"
  | "moon-outline"
  | "time-outline";

export type PlanningWindowTheme = {
  card: { backgroundColor: string; borderColor: string };
  pillBg: string;
  pillText: string;
  icon: PlanningWindowIcon;
};

export function planningWindowTheme(window: PlanningTimeWindow): PlanningWindowTheme {
  switch (window) {
    case "morning":
      return {
        card: { backgroundColor: "#fff5ea", borderColor: "#d4a574" },
        pillBg: "#fce5cf",
        pillText: "#6a4f22",
        icon: "sunny-outline",
      };
    case "afternoon":
      return {
        card: { backgroundColor: "#eef5fc", borderColor: "#6f9bc4" },
        pillBg: "#d9e6f4",
        pillText: "#2f4d6b",
        icon: "partly-sunny-outline",
      };
    case "twilight":
      return {
        card: { backgroundColor: "#f1ebf8", borderColor: "#9785bd" },
        pillBg: "#e2d6f0",
        pillText: "#4c3d63",
        icon: "moon-outline",
      };
    default:
      return {
        card: { backgroundColor: "#f5f4f2", borderColor: "#bfbbb5" },
        pillBg: "#eae8e4",
        pillText: colors.muted,
        icon: "time-outline",
      };
  }
}
