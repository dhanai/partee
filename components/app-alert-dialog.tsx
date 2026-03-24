"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type AppAlertOptions = {
  title?: string;
  confirmLabel?: string;
};

export type AppConfirmOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red primary action (e.g. delete). */
  variant?: "default" | "destructive";
};

type DialogState =
  | null
  | {
      kind: "alert";
      title?: string;
      message: string;
      confirmLabel: string;
      finish: (ok?: boolean) => void;
    }
  | {
      kind: "confirm";
      title?: string;
      message: string;
      confirmLabel: string;
      cancelLabel: string;
      destructive: boolean;
      finish: (ok: boolean) => void;
    };

type Ctx = {
  showAlert: (message: string, options?: AppAlertOptions) => Promise<void>;
  confirm: (message: string, options?: AppConfirmOptions) => Promise<boolean>;
};

const AppAlertDialogContext = createContext<Ctx | null>(null);

export function useAppAlert() {
  const ctx = useContext(AppAlertDialogContext);
  if (!ctx) {
    throw new Error("useAppAlert must be used within AppAlertDialogProvider");
  }
  return ctx;
}

export function AppAlertDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  const showAlert = useCallback((message: string, options?: AppAlertOptions) => {
    return new Promise<void>((resolve) => {
      setState({
        kind: "alert",
        message,
        title: options?.title,
        confirmLabel: options?.confirmLabel ?? "OK",
        finish: (ok?: boolean) => {
          void ok;
          setState(null);
          resolve();
        },
      });
    });
  }, []);

  const confirm = useCallback((message: string, options?: AppConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({
        kind: "confirm",
        message,
        title: options?.title,
        confirmLabel: options?.confirmLabel ?? "OK",
        cancelLabel: options?.cancelLabel ?? "Cancel",
        destructive: options?.variant === "destructive",
        finish: (ok) => {
          setState(null);
          resolve(ok);
        },
      });
    });
  }, []);

  useEffect(() => {
    if (!state) return;
    const current = state;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (current.kind === "alert") current.finish();
      else current.finish(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state]);

  useEffect(() => {
    if (!state || state.kind !== "confirm") return;
    const el = state.destructive ? cancelButtonRef.current : confirmButtonRef.current;
    const t = window.setTimeout(() => el?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [state]);

  const titleId = useId();
  const descId = useId();

  return (
    <AppAlertDialogContext.Provider value={{ showAlert, confirm }}>
      {children}
      {state ? (
        <div className="fixed inset-0 z-[110] flex flex-col justify-end items-stretch md:justify-center md:items-center md:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label={state.kind === "confirm" ? "Cancel" : "Dismiss"}
            onClick={() => {
              if (state.kind === "alert") state.finish();
              else state.finish(false);
            }}
          />
          <div
            className="relative w-full max-h-[min(90vh,480px)] overflow-y-auto rounded-t-[20px] bg-white shadow-[0_-8px_32px_rgba(0,0,0,0.12)] md:max-w-md md:rounded-[20px] md:shadow-[0_24px_48px_rgba(0,0,0,0.16)]"
            role={state.kind === "confirm" ? "alertdialog" : "alert"}
            aria-modal="true"
            aria-labelledby={state.title ? titleId : undefined}
            aria-describedby={descId}
          >
            <div className="space-y-3 px-5 pt-6 pb-6 md:px-6 md:pt-8 md:pb-7">
              {state.title ? (
                <h2 id={titleId} className="text-lg font-bold text-[#1c1c1e]">
                  {state.title}
                </h2>
              ) : null}
              <p id={descId} className="text-sm leading-relaxed text-[#1c1c1e]">
                {state.message}
              </p>
              <div
                className={`flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end ${state.kind === "confirm" ? "sm:gap-2" : ""}`}
              >
                {state.kind === "confirm" ? (
                  <button
                    ref={cancelButtonRef}
                    type="button"
                    className="parfade-btn-secondary w-full sm:w-auto"
                    onClick={() => state.finish(false)}
                  >
                    {state.cancelLabel}
                  </button>
                ) : null}
                <button
                  ref={state.kind === "confirm" ? confirmButtonRef : undefined}
                  type="button"
                  className={
                    state.kind === "confirm" && state.destructive
                      ? "inline-flex w-full items-center justify-center rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700 active:opacity-90 sm:w-auto"
                      : "parfade-btn-primary w-full sm:w-auto"
                  }
                  onClick={() =>
                    state.kind === "alert" ? state.finish() : state.finish(true)
                  }
                >
                  {state.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AppAlertDialogContext.Provider>
  );
}
