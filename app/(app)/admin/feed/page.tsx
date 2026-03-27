"use client";

import { useCallback, useEffect, useState } from "react";
import { ParfadeSpinner } from "@/components/parfade-spinner";

type FeedConfig = {
  sortMode: "chronological" | "scored";
};

type AppStoreConfig = {
  iosAppId: string | null;
};

export default function AdminFeedPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [config, setConfig] = useState<FeedConfig>({ sortMode: "chronological" });

  const [appStoreLoading, setAppStoreLoading] = useState(true);
  const [appStoreSaving, setAppStoreSaving] = useState(false);
  const [iosAppId, setIosAppId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/feed-config");
      const json = (await res.json()) as FeedConfig & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load");
      setConfig(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAppStore = useCallback(async () => {
    setAppStoreLoading(true);
    try {
      const res = await fetch("/api/admin/app-store");
      const json = (await res.json()) as AppStoreConfig & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load");
      setIosAppId(json.iosAppId ?? "");
    } catch {
      // ignore — field will just be empty
    } finally {
      setAppStoreLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadAppStore();
  }, [load, loadAppStore]);

  async function toggleSortMode() {
    const next: FeedConfig["sortMode"] = config.sortMode === "chronological" ? "scored" : "chronological";
    setSaving(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/admin/feed-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortMode: next }),
      });
      const json = (await res.json()) as FeedConfig & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setConfig(json);
      setNote(`Discover feed is now ${json.sortMode === "scored" ? "score-based" : "chronological"}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveAppStoreId() {
    setAppStoreSaving(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/admin/app-store", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iosAppId: iosAppId.trim() || null }),
      });
      const json = (await res.json()) as AppStoreConfig & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setIosAppId(json.iosAppId ?? "");
      setNote(json.iosAppId ? "App Store ID saved. Homepage will show a download button." : "App Store ID cleared.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setAppStoreSaving(false);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-[30px] font-bold text-[#1c1c1e]">App settings</h1>
        <p className="mt-1 text-sm text-[#6e6e6e]">
          Control feed behavior and app distribution.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</div>
      ) : null}
      {note ? (
        <div className="rounded-xl border border-[#d9e8dc] bg-[#edf4ef] px-3 py-2 text-sm font-semibold text-[#1a3c2a]">
          {note}
        </div>
      ) : null}

      {/* App Store */}
      <div className="space-y-4 rounded-xl border border-[#ece8e1] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-[#1c1c1e]">App Store</h2>
        <p className="text-sm text-[#6e6e6e]">
          Set your Apple App Store ID to show a download button on the homepage instead of sign-up.
        </p>
        {appStoreLoading ? (
          <div className="flex justify-center py-4">
            <ParfadeSpinner size="sm" variant="muted" aria-label="Loading" />
          </div>
        ) : (
          <>
            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">
                iOS App ID
              </span>
              <input
                value={iosAppId}
                onChange={(e) => setIosAppId(e.target.value)}
                placeholder="e.g. 6743210548"
                className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
              />
            </label>
            {iosAppId.trim() ? (
              <p className="text-xs text-[#999]">
                URL: <span className="font-mono">https://apps.apple.com/app/id{iosAppId.trim()}</span>
              </p>
            ) : null}
            <button
              type="button"
              disabled={appStoreSaving}
              onClick={() => void saveAppStoreId()}
              className="rounded-xl bg-[#1a3c2a] px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {appStoreSaving ? "Saving…" : "Save"}
            </button>
          </>
        )}
      </div>

      {/* Feed sort */}
      {loading ? (
        <div className="flex justify-center py-16">
          <ParfadeSpinner size="md" variant="muted" aria-label="Loading" />
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-[#ece8e1] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-[#1c1c1e]">Discover sort order</h2>
          <p className="text-sm text-[#6e6e6e]">
            Choose how rounds are ranked on the Discover tab for all users.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                if (config.sortMode !== "chronological") void toggleSortMode();
              }}
              className={`flex-1 rounded-xl border-2 p-4 text-left transition ${
                config.sortMode === "chronological"
                  ? "border-[#1a3c2a] bg-[#edf4ef]"
                  : "border-[#ece8e1] bg-[#faf8f5] hover:border-[#d8d3cb]"
              } ${saving ? "opacity-50" : ""}`}
            >
              <p className="text-sm font-bold text-[#1c1c1e]">Chronological</p>
              <p className="mt-1 text-xs text-[#6e6e6e]">
                Rounds sorted by date, nearest first. Distance is used as a tiebreaker when location is available.
              </p>
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={() => {
                if (config.sortMode !== "scored") void toggleSortMode();
              }}
              className={`flex-1 rounded-xl border-2 p-4 text-left transition ${
                config.sortMode === "scored"
                  ? "border-[#1a3c2a] bg-[#edf4ef]"
                  : "border-[#ece8e1] bg-[#faf8f5] hover:border-[#d8d3cb]"
              } ${saving ? "opacity-50" : ""}`}
            >
              <p className="text-sm font-bold text-[#1c1c1e]">Score-based algorithm</p>
              <p className="mt-1 text-xs text-[#6e6e6e]">
                Rounds ranked by social affinity (friends playing), fill rate, and date. Surfaces rounds the viewer is more likely to join.
              </p>
            </button>
          </div>

          <p className="text-xs text-[#999]">
            Currently active: <span className="font-semibold">{config.sortMode === "scored" ? "Score-based" : "Chronological"}</span>
          </p>
        </div>
      )}
    </section>
  );
}
