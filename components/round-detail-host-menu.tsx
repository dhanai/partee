"use client";

import { useAuth } from "@clerk/nextjs";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppAlert } from "@/components/app-alert-dialog";
import { useAppHeaderActions } from "@/components/app-header-actions-context";

function MenuInner({ inviteToken }: { inviteToken: string }) {
  const router = useRouter();
  const { getToken } = useAuth();
  const { confirm, showAlert } = useAppAlert();
  const [open, setOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const runDelete = useCallback(async () => {
    if (deleteBusy) return;
    const ok = await confirm(
      "This permanently removes the round and all RSVP activity.",
      {
        title: "Delete this round?",
        variant: "destructive",
        confirmLabel: "Delete",
      },
    );
    if (!ok) return;
    setDeleteBusy(true);
    try {
      const t = await getToken();
      if (!t) return;
      const res = await fetch(`/api/rounds/${inviteToken}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${t}` },
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        await showAlert(json.error ?? "Could not delete round.", {
          title: "Could not delete",
        });
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } finally {
      setDeleteBusy(false);
      setOpen(false);
    }
  }, [confirm, deleteBusy, getToken, inviteToken, router, showAlert]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={deleteBusy}
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border border-[#ece8e1] bg-white text-[#1a3c2a] shadow-sm transition hover:bg-[#faf8f5] active:opacity-90 disabled:opacity-50"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Round actions"
      >
        <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="12" cy="5" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="12" cy="19" r="1.75" />
        </svg>
      </button>
      {open ? (
        <ul
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-[60] min-w-[11rem] overflow-hidden rounded-xl border border-[#ece8e1] bg-white py-1 shadow-lg"
        >
          <li role="none">
            <Link
              role="menuitem"
              href={`/round/${inviteToken}/edit` as Route}
              className="block px-4 py-2.5 text-sm font-semibold text-[#1c1c1e] transition hover:bg-[#faf8f5]"
              onClick={() => setOpen(false)}
            >
              Edit round
            </Link>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              disabled={deleteBusy}
              className="w-full px-4 py-2.5 text-left text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
              onClick={() => void runDelete()}
            >
              {deleteBusy ? "Deleting…" : "Delete round"}
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}

/** Host-only overflow (⋯): Edit round, Delete round. Renders into app header actions. */
export function RoundDetailHostMenu({
  inviteToken,
  isHost,
}: {
  inviteToken: string;
  isHost: boolean;
}) {
  const { setHeaderActions } = useAppHeaderActions();

  useEffect(() => {
    if (!isHost) {
      setHeaderActions(null);
      return () => setHeaderActions(null);
    }
    setHeaderActions(<MenuInner inviteToken={inviteToken} />);
    return () => setHeaderActions(null);
  }, [isHost, inviteToken, setHeaderActions]);

  return null;
}
