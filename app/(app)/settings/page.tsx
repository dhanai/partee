"use client";

import { useClerk } from "@clerk/nextjs";
import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ParfadeSpinner } from "@/components/parfade-spinner";
import { cn } from "@/lib/utils";

type MeResponse = {
  user: {
    followVisibility?: "public" | "private";
    hideHostedRoundsFromDiscover?: boolean;
  };
};

export default function SettingsPage() {
  const { signOut } = useClerk();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingDiscover, setSavingDiscover] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [followVisibility, setFollowVisibility] = useState<"public" | "private">("public");
  const [hideHostedFromDiscover, setHideHostedFromDiscover] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const savingAny = saving || savingDiscover;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/users/me");
      const json = (await res.json()) as MeResponse & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Unable to load settings.");
      setFollowVisibility(json.user?.followVisibility ?? "public");
      setHideHostedFromDiscover(json.user?.hideHostedRoundsFromDiscover ?? false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveFollowVisibility(next: "public" | "private") {
    const previous = followVisibility;
    setSaving(true);
    setError(null);
    setSaveNote(null);
    setFollowVisibility(next);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followVisibility: next }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Unable to save.");
      setSaveNote("Saved");
    } catch (saveError) {
      setFollowVisibility(previous);
      setError(saveError instanceof Error ? saveError.message : "Unable to save settings.");
      setSaveNote("Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveHideHostedFromDiscover(next: boolean) {
    const previous = hideHostedFromDiscover;
    setSavingDiscover(true);
    setError(null);
    setSaveNote(null);
    setHideHostedFromDiscover(next);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hideHostedRoundsFromDiscover: next }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Unable to save.");
      setSaveNote("Saved");
    } catch (saveError) {
      setHideHostedFromDiscover(previous);
      setError(saveError instanceof Error ? saveError.message : "Unable to save settings.");
      setSaveNote("Save failed");
    } finally {
      setSavingDiscover(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    setError(null);
    try {
      await signOut({ redirectUrl: "/sign-in" });
    } catch (signOutErr) {
      setError(signOutErr instanceof Error ? signOutErr.message : "Couldn't sign out.");
      setSigningOut(false);
    }
  }

  const profilePrivate = followVisibility === "private";

  return (
    <section className="space-y-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/profile"
          className="text-sm font-semibold text-[#1a3c2a] underline-offset-2 hover:underline"
        >
          ← Profile
        </Link>
        {!loading && (savingAny || saveNote != null) ? (
          <span className="rounded-full border border-[#ece8e1] bg-[#edf4ef] px-2.5 py-1 text-xs font-bold text-[#1a3c2a]">
            {savingAny ? "Saving…" : saveNote}
          </span>
        ) : null}
      </div>

      <div>
        <h1 className="text-[28px] font-bold text-[#1c1c1e]">Settings</h1>
        <p className="mt-1 text-sm text-[#6e6e6e]">
          Privacy and Discover. For photo, name, handicap, and location, use{" "}
          <Link
            href={"/profile/edit" as Route}
            className="font-semibold text-[#1a3c2a] underline-offset-2 hover:underline"
          >
            Edit profile
          </Link>
          .
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <ParfadeSpinner size="md" variant="muted" aria-label="Loading settings" />
        </div>
      ) : (
        <>
          <div className="space-y-3 rounded-xl border border-[#ece8e1] bg-white p-3 shadow-sm">
            <p className="text-base font-bold text-[#1c1c1e]">Privacy</p>
            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="flex-1 text-sm text-[#1c1c1e]">Make my profile private</span>
              <button
                type="button"
                role="switch"
                aria-checked={profilePrivate}
                disabled={savingAny}
                onClick={() =>
                  void saveFollowVisibility(profilePrivate ? "public" : "private")
                }
                className={cn(
                  "relative h-8 w-[52px] shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a3c2a]/30 disabled:opacity-50",
                  profilePrivate ? "bg-[#edf4ef]" : "bg-[#ece8e1]",
                )}
              >
                <span
                  className={cn(
                    "absolute top-1 h-6 w-6 rounded-full shadow-sm transition-all",
                    profilePrivate
                      ? "right-1 left-auto bg-[#1a3c2a]"
                      : "left-1 bg-white ring-1 ring-[#ece8e1]",
                  )}
                  aria-hidden
                />
              </button>
            </div>
            {profilePrivate ? (
              <p className="text-sm leading-relaxed text-[#6e6e6e]">
                New followers need your approval. Requests appear on{" "}
                <Link
                  href={"/notifications" as Route}
                  className="font-semibold text-[#1a3c2a] underline-offset-2 hover:underline"
                >
                  Notifications
                </Link>
                , where you can approve or decline.
              </p>
            ) : null}
          </div>

          <div className="space-y-3 rounded-xl border border-[#ece8e1] bg-white p-3 shadow-sm">
            <p className="text-base font-bold text-[#1c1c1e]">Discover</p>
            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="flex-1 text-sm text-[#1c1c1e]">
                Hide my hosted rounds on my Discover
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={hideHostedFromDiscover}
                disabled={savingAny}
                onClick={() => void saveHideHostedFromDiscover(!hideHostedFromDiscover)}
                className={cn(
                  "relative h-8 w-[52px] shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a3c2a]/30 disabled:opacity-50",
                  hideHostedFromDiscover ? "bg-[#edf4ef]" : "bg-[#ece8e1]",
                )}
              >
                <span
                  className={cn(
                    "absolute top-1 h-6 w-6 rounded-full shadow-sm transition-all",
                    hideHostedFromDiscover
                      ? "right-1 left-auto bg-[#1a3c2a]"
                      : "left-1 bg-white ring-1 ring-[#ece8e1]",
                  )}
                  aria-hidden
                />
              </button>
            </div>
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            className="w-full rounded-xl border border-[#ece8e1] bg-white py-3 text-center text-sm font-bold text-[#1c1c1e] shadow-sm transition hover:bg-[#faf8f5] disabled:opacity-60"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </>
      )}
    </section>
  );
}
