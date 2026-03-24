"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppAlertDialogProvider } from "@/components/app-alert-dialog";
import { AppCreateProvider } from "@/components/app-create-provider";
import {
  AppHeaderActionsProvider,
  AppHeaderActionsSlot,
} from "@/components/app-header-actions-context";
import { AppTabBar } from "@/components/app-tab-bar";
import { NotificationBadgeWebProvider } from "@/components/notification-badge-web-context";
import { ParfadeWordmark } from "@/components/parfade-wordmark";
import { isRoundChatPath } from "@/lib/is-round-chat-path";

const tabBarStackVar = {
  ["--app-tab-bar-stack" as string]:
    "calc(4.125rem + max(0.75rem, env(safe-area-inset-bottom, 0px)))",
} as CSSProperties;

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const chatImmersive = isRoundChatPath(pathname);
  const adminImmersive = pathname === "/admin" || pathname?.startsWith("/admin/");
  const hideTabBar = chatImmersive || adminImmersive;

  return (
    <AppAlertDialogProvider>
      <AppCreateProvider>
        <AppHeaderActionsProvider>
          <NotificationBadgeWebProvider>
            <div
              className="flex min-h-dvh flex-col bg-[#faf8f5] text-[#1c1c1e] antialiased"
              style={tabBarStackVar}
            >
              <header className="sticky top-0 z-30 flex h-[52px] shrink-0 items-center gap-2 border-b border-[#ece8e1] bg-[#faf8f5]/95 px-5 backdrop-blur-md sm:px-6 lg:h-14 lg:px-8">
                <Link
                  href="/discover"
                  className="-ml-0.5 block shrink-0 origin-left rounded-md transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a3c2a]/30 lg:scale-[1.06]"
                  aria-label="Parfade home"
                >
                  <ParfadeWordmark widthPx={109} className="block" />
                </Link>
                <AppHeaderActionsSlot />
              </header>
              <main
                className={
                  adminImmersive
                    ? "w-full flex-1 p-0"
                    : hideTabBar
                    ? "mx-auto w-full max-w-lg flex-1 px-5 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-4 sm:max-w-2xl sm:px-6 lg:max-w-3xl lg:px-8 lg:pt-5 xl:max-w-4xl"
                    : "mx-auto w-full max-w-lg flex-1 px-5 pb-[var(--app-tab-bar-stack)] pt-4 sm:max-w-2xl sm:px-6 lg:max-w-3xl lg:px-8 lg:pt-5 xl:max-w-4xl"
                }
              >
                {children}
              </main>
              {hideTabBar ? null : <AppTabBar />}
            </div>
          </NotificationBadgeWebProvider>
        </AppHeaderActionsProvider>
      </AppCreateProvider>
    </AppAlertDialogProvider>
  );
}
