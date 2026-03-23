"use client";

import type { ReactNode } from "react";
import type { PlanningWindowIconName } from "@/lib/planning-window-theme";

export function PlanningWindowIcon({
  name,
  color,
  size = 15,
}: {
  name: PlanningWindowIconName;
  color: string;
  size?: number;
}) {
  const svg = (children: ReactNode) => (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden
      style={{ color }}
    >
      {children}
    </svg>
  );

  switch (name) {
    case "sunny":
      return svg(
        <>
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.75" />
          <path
            d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </>,
      );
    case "partly-sunny":
      return svg(
        <>
          <path
            d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity={0.45}
          />
          <path
            d="M18 10h.5a3.5 3.5 0 0 1 0 7H16"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
          <path
            d="M8 18a5 5 0 1 1 4.9-6"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </>,
      );
    case "moon":
      return svg(
        <path
          d="M21 14.5A8.5 8.5 0 0 1 9.5 3 6.5 6.5 0 1 0 21 14.5Z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />,
      );
    default:
      return svg(
        <>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
          <path
            d="M12 7v5l3 2"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>,
      );
  }
}
