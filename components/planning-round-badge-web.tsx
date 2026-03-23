"use client";

import { planningWindowTheme } from "@/lib/planning-window-theme";
import { PlanningWindowIcon } from "@/components/planning-window-icon";

type PlanningTimeWindow = "morning" | "afternoon" | "twilight" | null | undefined;

export function PlanningRoundBadgeWeb({
  preferredTimeWindow,
  compact,
}: {
  preferredTimeWindow: PlanningTimeWindow;
  compact?: boolean;
}) {
  const t = planningWindowTheme(preferredTimeWindow);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[13px] font-semibold ${compact ? "mb-1.5" : ""}`}
      style={{ backgroundColor: t.pillBg, color: t.pillText }}
    >
      <PlanningWindowIcon name={t.icon} color={t.pillText} size={15} />
      Planning
    </span>
  );
}
