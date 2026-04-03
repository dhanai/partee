import { useAuth } from "@clerk/clerk-expo";
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
import { listMyGameSessions } from "./games-api";
import { subscribeGamesListRefresh } from "./games-list-refresh";

type GameSessionActiveContextValue = {
  /** True when the signed-in user has at least one `active` game in `/api/games/mine`. */
  hasActiveGameSession: boolean;
  refresh: () => Promise<void>;
};

const GameSessionActiveContext = createContext<GameSessionActiveContextValue | null>(null);

const POLL_INTERVAL_MS = 90_000;

export function GameSessionActiveProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [hasActiveGameSession, setHasActiveGameSession] = useState(false);
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const refresh = useCallback(async () => {
    if (!isSignedIn) {
      setHasActiveGameSession(false);
      return;
    }
    try {
      const token = await getTokenRef.current();
      const data = await listMyGameSessions(token);
      const sessions = data.sessions ?? [];
      setHasActiveGameSession(sessions.some((s) => s.status === "active"));
    } catch {
      // Keep last known value on transient errors
    }
  }, [isSignedIn]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setHasActiveGameSession(false);
      return;
    }
    void refresh();
  }, [isLoaded, isSignedIn, refresh]);

  useEffect(() => {
    if (!isSignedIn) return;
    return subscribeGamesListRefresh(() => {
      void refresh();
    });
  }, [isSignedIn, refresh]);

  useEffect(() => {
    if (!isSignedIn) return;
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") void refresh();
    });
    return () => sub.remove();
  }, [isSignedIn, refresh]);

  useEffect(() => {
    if (!isSignedIn) return;
    const id = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isSignedIn, refresh]);

  const value = useMemo(
    () => ({ hasActiveGameSession, refresh }),
    [hasActiveGameSession, refresh],
  );

  return (
    <GameSessionActiveContext.Provider value={value}>{children}</GameSessionActiveContext.Provider>
  );
}

export function useGameSessionActive(): GameSessionActiveContextValue {
  const ctx = useContext(GameSessionActiveContext);
  if (!ctx) {
    throw new Error("useGameSessionActive must be used within GameSessionActiveProvider");
  }
  return ctx;
}
