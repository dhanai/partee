"use client";

import { planningWindowTheme } from "@/lib/planning-window-theme";
import { PlanningWindowIcon } from "@/components/planning-window-icon";

const SLOTS = [
  { value: "morning" as const, label: "Morning" },
  { value: "afternoon" as const, label: "Afternoon" },
  { value: "twilight" as const, label: "Twilight" },
];

export type PlanningTimeWindowChoice = (typeof SLOTS)[number]["value"];

export function PlanningTimeWindowChipsWeb({
  value,
  onChange,
}: {
  value: PlanningTimeWindowChoice;
  onChange: (value: PlanningTimeWindowChoice) => void;
}) {
  return (
    <div className="flex gap-2">
      {SLOTS.map((slot) => {
        const t = planningWindowTheme(slot.value);
        const selected = value === slot.value;
        return (
          <button
            key={slot.value}
            type="button"
            onClick={() => onChange(slot.value)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border py-2.5 px-1.5 text-[13px] font-semibold transition active:opacity-90"
            style={
              selected
                ? {
                    backgroundColor: t.pillBg,
                    borderColor: t.card.borderColor,
                    color: t.pillText,
                  }
                : {
                    backgroundColor: "#f1efea",
                    borderColor: "#ece8e1",
                    color: "#6e6e6e",
                  }
            }
          >
            <PlanningWindowIcon
              name={t.icon}
              color={selected ? t.pillText : "#6e6e6e"}
              size={17}
            />
            <span className="truncate">{slot.label}</span>
          </button>
        );
      })}
    </div>
  );
}
