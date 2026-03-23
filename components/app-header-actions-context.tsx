"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

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
  return (
    <div className="ml-auto flex min-w-0 shrink-0 items-center justify-end gap-1">
      {ctx?.node ?? null}
    </div>
  );
}
