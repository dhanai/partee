import { useAuth } from "@clerk/clerk-expo";
import * as Notifications from "expo-notifications";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import { apiGet, apiPost } from "./api";
import { configureExpoNotificationBehavior, registerExpoPushTokenWithBackend } from "./register-expo-push";

type BadgeResponse = {
  showBadge: boolean;
  lastViewedAt: string | null;
  /** Round spots with status `invited` on non-completed rounds (claim/decline pending). */
  pendingOpenInviteCount?: number;
};

type NotificationBadgeContextValue = {
  showBadge: boolean;
  refresh: () => Promise<void>;
  markNotificationsSeen: () => Promise<void>;
};

const NotificationBadgeContext = createContext<NotificationBadgeContextValue | null>(null);

/** Light polling while browsing; skipped in background. */
const BADGE_POLL_INTERVAL_MS = 45_000;

async function registerPushBestEffort(getToken: () => Promise<string | null>) {
  try {
    await registerExpoPushTokenWithBackend(getToken);
  } catch (e) {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.warn("[Parfade] Push token registration failed (invites may not push until this works):", e);
    }
  }
}

export function NotificationBadgeProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, getToken } = useAuth();
  const [showBadge, setShowBadge] = useState(false);
  const getTokenRef = useRef(getToken);
  const isSignedInRef = useRef(isSignedIn);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    configureExpoNotificationBehavior();
  }, []);

  useEffect(() => {
    isSignedInRef.current = isSignedIn;
  }, [isSignedIn]);

  // Clerk can report signed-in before getToken() resolves; retry so /api/users/me/push-token runs.
  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < 12; i++) {
        if (cancelled) return;
        const session = await getTokenRef.current();
        if (session) {
          await registerPushBestEffort(() => getTokenRef.current());
          return;
        }
        await new Promise((r) => setTimeout(r, 200 + i * 80));
      }
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.warn(
          "[Parfade] Could not register push token: Clerk session never became available.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  const syncAppIconBadge = useCallback(async (inviteCount: number) => {
    try {
      const n = Math.max(0, Math.min(Math.floor(inviteCount), 99));
      await Notifications.setBadgeCountAsync(n);
    } catch {
      // Unsupported or denied (e.g. simulator, permissions).
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!isSignedInRef.current) {
      setShowBadge(false);
      await syncAppIconBadge(0);
      return;
    }
    try {
      const token = await getTokenRef.current();
      const data = await apiGet<BadgeResponse>("/api/users/me/notification-badge", token);
      setShowBadge(data.showBadge);
      await syncAppIconBadge(data.pendingOpenInviteCount ?? 0);
    } catch {
      // Keep prior UI state on failure.
    }
  }, [syncAppIconBadge]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  // Only re-fetch when auth session presence changes — avoids effect ↔ setState loops
  // if Clerk re-renders and previously recreated `refresh`.
  useEffect(() => {
    void refreshRef.current();
  }, [isSignedIn]);

  useEffect(() => {
    appStateRef.current = AppState.currentState;
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      appStateRef.current = state;
      if (state === "active") {
        void refreshRef.current();
        if (isSignedInRef.current) {
          void registerPushBestEffort(() => getTokenRef.current());
        }
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!isSignedIn) return;
    const id = setInterval(() => {
      if (appStateRef.current !== "active") return;
      void refreshRef.current();
    }, BADGE_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isSignedIn]);

  const markNotificationsSeen = useCallback(async () => {
    if (!isSignedInRef.current) return;
    try {
      const token = await getTokenRef.current();
      await apiPost<{ ok: true }>("/api/users/me/notification-badge", {}, token);
      await refreshRef.current();
    } catch {
      // Caller already has list; badge can refresh on next foreground.
    }
  }, []);

  const value = useMemo(
    () => ({ showBadge, refresh, markNotificationsSeen }),
    [markNotificationsSeen, refresh, showBadge],
  );

  return (
    <NotificationBadgeContext.Provider value={value}>{children}</NotificationBadgeContext.Provider>
  );
}

export function useNotificationBadge() {
  const ctx = useContext(NotificationBadgeContext);
  if (!ctx) {
    throw new Error("useNotificationBadge must be used within NotificationBadgeProvider");
  }
  return ctx;
}
