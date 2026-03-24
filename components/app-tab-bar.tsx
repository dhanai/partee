"use client";

import { useContext } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreateSheetContext } from "@/components/app-create-provider";
import { NOTIFICATION_MUSTARD, useNotificationBadgeWeb } from "@/components/notification-badge-web-context";

const fairway = "#1a3c2a";
const muted = "#6e6e6e";

function IconCompass({ active }: { active: boolean }) {
  const c = active ? fairway : muted;
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.75" />
      <path
        d="M14.5 9.5 10 10l-.5 4.5 4.5-.5.5-4.5Z"
        stroke={c}
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconList({ active }: { active: boolean }) {
  const c = active ? fairway : muted;
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
        stroke={c}
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconAddCircle({ active }: { active: boolean }) {
  const c = active ? fairway : muted;
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.75" />
      <path d="M12 8v8M8 12h8" stroke={c} strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconFlag({ active }: { active: boolean }) {
  const c = active ? fairway : muted;
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 3v18M5 4h11l-2 3.5 2 3.5H5"
        stroke={c}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconPerson({ active }: { active: boolean }) {
  const c = active ? fairway : muted;
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.25" stroke={c} strokeWidth="1.75" />
      <path
        d="M6 19.5c0-3.5 2.5-5 6-5s6 1.5 6 5"
        stroke={c}
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

const tabs = [
  { href: "/discover", label: "Discover", Icon: IconCompass, match: (p: string) => p === "/discover" },
  {
    href: "/dashboard",
    label: "My Rounds",
    Icon: IconList,
    match: (p: string) => p === "/dashboard" || p === "/notifications",
  },
  {
    href: "/create",
    label: "Create",
    Icon: IconAddCircle,
    match: (p: string) => p.startsWith("/create"),
    openSheet: true as const,
  },
  { href: "/games", label: "Games", Icon: IconFlag, match: (p: string) => p === "/games" },
  {
    href: "/profile",
    label: "Profile",
    Icon: IconPerson,
    match: (p: string) => p.startsWith("/profile"),
  },
] as const;

function TabNotificationDot() {
  return (
    <span
      className="pointer-events-none absolute right-0 top-0 z-[1] h-[7px] w-[7px] translate-x-[3px] -translate-y-[3px] rounded-full ring-[1.5px] ring-white"
      style={{ backgroundColor: NOTIFICATION_MUSTARD }}
      aria-hidden
    />
  );
}

export function AppTabBar() {
  const pathname = usePathname() ?? "";
  const onRoundInvite = pathname.startsWith("/round/");
  const createSheet = useContext(CreateSheetContext);
  const { showBadge } = useNotificationBadgeWeb();

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:px-5">
      <nav
        className="pointer-events-auto w-full max-w-lg rounded-2xl border border-[#ece8e1] bg-white/95 shadow-[0_8px_32px_rgba(0,0,0,0.1),0_2px_8px_rgba(0,0,0,0.04)] backdrop-blur-md supports-[backdrop-filter]:bg-white/90 sm:max-w-2xl"
        aria-label="Main"
      >
        <div className="flex h-[66px] items-center justify-between gap-0 px-2">
          {tabs.map((tab) => {
            const { href, label, Icon, match } = tab;
            const active = !onRoundInvite && match(pathname);
            const className =
              "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1 text-[11px] font-semibold transition-colors active:opacity-80";
            const showTabDot = showBadge && href === "/dashboard";

            if ("openSheet" in tab && tab.openSheet && createSheet) {
              return (
                <button
                  key={href}
                  type="button"
                  onClick={() => createSheet.openCreateSheet()}
                  className={className}
                  style={{ color: active ? fairway : muted }}
                >
                  <span className="relative flex h-[26px] w-[26px] items-center justify-center">
                    <Icon active={active} />
                  </span>
                  <span className="truncate px-0.5 text-center leading-tight">{label}</span>
                </button>
              );
            }

            return (
              <Link
                key={href}
                href={href as never}
                className={className}
                style={{ color: active ? fairway : muted }}
              >
                <span className="relative flex h-[26px] w-[26px] items-center justify-center">
                  <Icon active={active} />
                  {showTabDot ? <TabNotificationDot /> : null}
                </span>
                <span className="truncate px-0.5 text-center leading-tight">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
