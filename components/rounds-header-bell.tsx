"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAppHeaderActions } from "@/components/app-header-actions-context";

export function RoundsHeaderBell() {
  const { setHeaderActions } = useAppHeaderActions();
  const [showBadge, setShowBadge] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/users/me/notification-badge");
        const json = (await res.json()) as { showBadge?: boolean };
        if (res.ok) setShowBadge(Boolean(json.showBadge));
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    setHeaderActions(
      <Link
        href="/notifications"
        className="relative flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border border-[#ece8e1] bg-white text-[#1a3c2a] shadow-sm transition hover:bg-[#faf8f5] active:opacity-90"
        aria-label={showBadge ? "Notifications, unread items" : "Notifications"}
      >
        {showBadge ? (
          <span
            className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-white"
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
      </Link>,
    );
    return () => setHeaderActions(null);
  }, [setHeaderActions, showBadge]);

  return null;
}
