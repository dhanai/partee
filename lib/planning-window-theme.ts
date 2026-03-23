/** Aligned with `apps/mobile/lib/planning-window-theme.ts`. */

export type PlanningTimeWindow = "morning" | "afternoon" | "twilight" | null | undefined;

export type PlanningWindowIconName = "sunny" | "partly-sunny" | "moon" | "time";

export type PlanningWindowTheme = {
  card: { backgroundColor: string; borderColor: string };
  pillBg: string;
  pillText: string;
  icon: PlanningWindowIconName;
};

export function planningWindowTheme(window: PlanningTimeWindow): PlanningWindowTheme {
  switch (window) {
    case "morning":
      return {
        card: { backgroundColor: "#fff5ea", borderColor: "#d4a574" },
        pillBg: "#fce5cf",
        pillText: "#6a4f22",
        icon: "sunny",
      };
    case "afternoon":
      return {
        card: { backgroundColor: "#eef5fc", borderColor: "#6f9bc4" },
        pillBg: "#d9e6f4",
        pillText: "#2f4d6b",
        icon: "partly-sunny",
      };
    case "twilight":
      return {
        card: { backgroundColor: "#f1ebf8", borderColor: "#9785bd" },
        pillBg: "#e2d6f0",
        pillText: "#4c3d63",
        icon: "moon",
      };
    default:
      return {
        card: { backgroundColor: "#f5f4f2", borderColor: "#bfbbb5" },
        pillBg: "#eae8e4",
        pillText: "#6e6e6e",
        icon: "time",
      };
  }
}
