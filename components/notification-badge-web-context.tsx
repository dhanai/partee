"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

/** Matches `colors.mustard` in `apps/mobile/lib/theme.ts`. */
export const NOTIFICATION_MUSTARD = "#c9a227";

type Ctx = {
  showBadge: boolean;
  refresh: () => Promise<void>;
};

const NotificationBadgeWebContext = createContext<Ctx | null>(null);

export function NotificationBadgeWebProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [showBadge, setShowBadge] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/users/me/notification-badge", { cache: "no-store" });
      const json = (await res.json()) as { showBadge?: boolean };
      if (res.ok) setShowBadge(Boolean(json.showBadge));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, pathname]);

  const value = useMemo(() => ({ showBadge, refresh }), [showBadge, refresh]);

  return (
    <NotificationBadgeWebContext.Provider value={value}>{children}</NotificationBadgeWebContext.Provider>
  );
}

export function useNotificationBadgeWeb() {
  const v = useContext(NotificationBadgeWebContext);
  if (!v) {
    throw new Error("useNotificationBadgeWeb must be used within NotificationBadgeWebProvider");
  }
  return v;
}
