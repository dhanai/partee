"use client";

import Link from "next/link";
import { NOTIFICATION_MUSTARD, useNotificationBadgeWeb } from "@/components/notification-badge-web-context";

export function AppHeaderNotificationBell() {
  const { showBadge } = useNotificationBadgeWeb();

  return (
    <Link
      href="/notifications"
      className="relative flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border border-[#ece8e1] bg-white text-[#1a3c2a] shadow-sm transition hover:bg-[#faf8f5] active:opacity-90"
      aria-label={showBadge ? "Notifications, unread items" : "Notifications"}
    >
      {showBadge ? (
        <span
          className="pointer-events-none absolute right-0.5 top-0.5 z-[1] h-[7px] w-[7px] rounded-full ring-[1.5px] ring-white"
          style={{ backgroundColor: NOTIFICATION_MUSTARD }}
          aria-hidden
        />
      ) : null}
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M13.73 21a2 2 0 01-3.46 0"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    </Link>
  );
}
