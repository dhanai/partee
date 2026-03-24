"use client";

import {
  createContext,
  useEffect,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppHeaderNotificationBell } from "@/components/app-header-notification-bell";
import { isRoundChatPath } from "@/lib/is-round-chat-path";

type Value = {
  node: ReactNode | null;
  setHeaderActions: (node: ReactNode | null) => void;
};

const AppHeaderActionsContext = createContext<Value | null>(null);

export function AppHeaderActionsProvider({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<ReactNode | null>(null);
  const setHeaderActions = useCallback((n: ReactNode | null) => {
    setNode(n);
  }, []);
  const value = useMemo(
    () => ({ node, setHeaderActions }),
    [node, setHeaderActions],
  );
  return (
    <AppHeaderActionsContext.Provider value={value}>
      {children}
    </AppHeaderActionsContext.Provider>
  );
}

export function useAppHeaderActions() {
  const ctx = useContext(AppHeaderActionsContext);
  if (!ctx) {
    throw new Error("useAppHeaderActions must be used within AppHeaderActionsProvider");
  }
  return ctx;
}

export function AppHeaderActionsSlot() {
  const ctx = useContext(AppHeaderActionsContext);
  const pathname = usePathname();
  const hideBell = isRoundChatPath(pathname);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadMe() {
      try {
        const res = await fetch("/api/users/me");
        if (!res.ok) return;
        const json = (await res.json()) as { user?: { isAdmin?: boolean } };
        if (!cancelled) {
          setIsAdmin(Boolean(json.user?.isAdmin));
        }
      } catch {
        if (!cancelled) setIsAdmin(false);
      }
    }
    void loadMe();
    return () => {
      cancelled = true;
    };
  }, []);

  const isAdminRoute = pathname === "/admin" || pathname?.startsWith("/admin/");

  return (
    <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2">
      <div className="flex min-w-0 items-center justify-end gap-1">{ctx?.node ?? null}</div>
      {isAdmin ? (
        <Link
          href="/admin"
          aria-label="Admin panel"
          title="Admin panel"
          className={
            isAdminRoute
              ? "inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#1a3c2a] bg-[#edf4ef] text-[#1a3c2a]"
              : "inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#ece8e1] bg-white text-[#1c1c1e] transition hover:border-[#d8d3cb]"
          }
        >
          <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 fill-current">
            <path d="M12 2 3 6v6c0 5.2 3.4 10 9 11 5.6-1 9-5.8 9-11V6l-9-4Zm0 2.2 7 3.1V12c0 4.3-2.6 8.1-7 9.1-4.4-1-7-4.8-7-9.1V7.3l7-3.1Zm-1.2 10.9-2.4-2.4-1.4 1.4 3.8 3.8 6.2-6.2-1.4-1.4-4.8 4.8Z" />
          </svg>
        </Link>
      ) : null}
      {hideBell ? null : <AppHeaderNotificationBell />}
    </div>
  );
}
