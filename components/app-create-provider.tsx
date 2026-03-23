"use client";

import { createContext, useContext, useState } from "react";
import { useRouter } from "next/navigation";

type Ctx = { openCreateSheet: () => void };

export const CreateSheetContext = createContext<Ctx | null>(null);

export function useCreateSheet() {
  const v = useContext(CreateSheetContext);
  if (!v) {
    throw new Error("useCreateSheet must be used within AppCreateProvider");
  }
  return v;
}

export function AppCreateProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const router = useRouter();

  function pick(mode: "planning" | "scheduled") {
    setVisible(false);
    const session = Date.now().toString();
    router.push(`/create?mode=${mode}&session=${session}`);
  }

  return (
    <CreateSheetContext.Provider value={{ openCreateSheet: () => setVisible(true) }}>
      {children}
      {visible ? (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Dismiss create options"
            onClick={() => setVisible(false)}
          />
          <div
            className="relative max-h-[min(85vh,520px)] overflow-y-auto rounded-t-[20px] bg-white shadow-[0_-8px_32px_rgba(0,0,0,0.12)]"
            role="dialog"
            aria-labelledby="create-sheet-title"
          >
            <div className="sticky top-0 flex justify-center bg-white pb-2 pt-2">
              <div className="h-1 w-10 rounded-full bg-[#ece8e1]" aria-hidden />
            </div>
            <div className="space-y-2.5 px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-0">
              <h2 id="create-sheet-title" className="text-xl font-bold text-[#1c1c1e]">
                What do you want to create?
              </h2>
              <p className="text-sm text-[#6e6e6e]">Choose a format to get started.</p>

              <button
                type="button"
                onClick={() => pick("planning")}
                className="flex w-full items-center gap-2.5 rounded-xl border border-[#ece8e1] bg-[#faf8f5] p-2.5 text-left transition hover:bg-[#f5f2ec] active:opacity-90"
              >
                <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-[#edf4ef] text-[#1a3c2a]">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-[#1c1c1e]">Planning round</span>
                  <span className="mt-0.5 block text-xs text-[#6e6e6e]">
                    Find players first, lock details later.
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => pick("scheduled")}
                className="flex w-full items-center gap-2.5 rounded-xl border border-[#ece8e1] bg-[#faf8f5] p-2.5 text-left transition hover:bg-[#f5f2ec] active:opacity-90"
              >
                <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-[#edf4ef] text-[#1a3c2a]">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.75" />
                    <path
                      d="M4 20v-2a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v2M15 11h5M17.5 8.5v5"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-[#1c1c1e]">Scheduled tee time</span>
                  <span className="mt-0.5 block text-xs text-[#6e6e6e]">
                    Set course and tee time now.
                  </span>
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </CreateSheetContext.Provider>
  );
}
