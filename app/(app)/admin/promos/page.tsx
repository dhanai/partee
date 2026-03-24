"use client";

import { useCallback, useEffect, useState } from "react";
import { ParfadeSpinner } from "@/components/parfade-spinner";

type Slot = {
  enabled: boolean;
  targetUrl: string | null;
  mediaUrl: string | null;
  mediaKind: "image" | "video" | null;
  title: string;
  subtitle: string;
  ctaLabel: string;
  discoverMixPercent: number;
};

type Payload = { discover: Slot; gameEnd: Slot };

const emptySlot = (): Slot => ({
  enabled: false,
  targetUrl: "",
  mediaUrl: null,
  mediaKind: null,
  title: "",
  subtitle: "",
  ctaLabel: "",
  discoverMixPercent: 0,
});

function SlotFields({
  label,
  slot,
  onChange,
  showMix,
  uploadBusy,
  onPickFile,
}: {
  label: string;
  slot: Slot;
  onChange: (next: Slot) => void;
  showMix: boolean;
  uploadBusy: boolean;
  onPickFile: (file: File) => void;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-[#ece8e1] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-[#1c1c1e]">{label}</h2>
        <label className="flex items-center gap-2 text-sm font-semibold text-[#1c1c1e]">
          <input
            type="checkbox"
            checked={slot.enabled}
            onChange={(e) => onChange({ ...slot, enabled: e.target.checked })}
            className="h-4 w-4 rounded border-[#ece8e1] text-[#1a3c2a] focus:ring-[#1a3c2a]"
          />
          Enabled
        </label>
      </div>

      {showMix ? (
        <label className="block space-y-1">
          <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">
            House promo share of ad slots (0–100%)
          </span>
          <input
            type="number"
            min={0}
            max={100}
            value={slot.discoverMixPercent}
            onChange={(e) =>
              onChange({ ...slot, discoverMixPercent: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })
            }
            className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
          />
        </label>
      ) : null}

      <label className="block space-y-1">
        <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">Tap / swipe-up URL</span>
        <input
          type="url"
          value={slot.targetUrl ?? ""}
          onChange={(e) => onChange({ ...slot, targetUrl: e.target.value })}
          placeholder="https://…"
          className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
        />
      </label>

      <div className="space-y-2">
        <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">Media (photo or video)</span>
        <div className="flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-lg border border-[#1a3c2a] bg-[#edf4ef] px-3 py-2 text-sm font-bold text-[#1a3c2a]">
            {uploadBusy ? "Uploading…" : "Upload file"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,.mp4,.mov"
              className="hidden"
              disabled={uploadBusy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) onPickFile(f);
              }}
            />
          </label>
          {slot.mediaUrl ? (
            <button
              type="button"
              className="text-sm font-semibold text-red-700 underline"
              onClick={() => onChange({ ...slot, mediaUrl: null, mediaKind: null })}
            >
              Clear media
            </button>
          ) : null}
        </div>
        {slot.mediaUrl ? (
          <p className="break-all text-xs text-[#6e6e6e]">{slot.mediaUrl}</p>
        ) : null}
        {slot.mediaKind === "video" && slot.mediaUrl ? (
          <video src={slot.mediaUrl} controls className="mt-2 max-h-64 w-full rounded-lg bg-black" />
        ) : null}
        {slot.mediaKind === "image" && slot.mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={slot.mediaUrl} alt="" className="mt-2 max-h-48 w-full rounded-lg object-cover" />
        ) : null}
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">Title</span>
        <input
          value={slot.title}
          onChange={(e) => onChange({ ...slot, title: e.target.value })}
          className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">Subtitle</span>
        <textarea
          value={slot.subtitle}
          onChange={(e) => onChange({ ...slot, subtitle: e.target.value })}
          rows={2}
          className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">Button / CTA label</span>
        <input
          value={slot.ctaLabel}
          onChange={(e) => onChange({ ...slot, ctaLabel: e.target.value })}
          placeholder="Shop now · Swipe up"
          className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
        />
      </label>
    </div>
  );
}

export default function AdminPromosPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<"discover" | "gameEnd" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [discover, setDiscover] = useState<Slot>(() => emptySlot());
  const [gameEnd, setGameEnd] = useState<Slot>(() => emptySlot());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/house-ads");
      const json = (await res.json()) as Payload & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load");
      setDiscover({
        ...json.discover,
        targetUrl: json.discover.targetUrl ?? "",
      });
      setGameEnd({
        ...json.gameEnd,
        targetUrl: json.gameEnd.targetUrl ?? "",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function uploadFor(target: "discover" | "gameEnd", file: File) {
    setUploadTarget(target);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/admin/promo-media", { method: "POST", body: fd });
      const json = (await res.json()) as { url?: string; mediaKind?: "image" | "video"; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      if (!json.url || !json.mediaKind) throw new Error("Bad upload response");
      if (target === "discover") {
        setDiscover((s) => ({ ...s, mediaUrl: json.url!, mediaKind: json.mediaKind! }));
      } else {
        setGameEnd((s) => ({ ...s, mediaUrl: json.url!, mediaKind: json.mediaKind! }));
      }
      setNote("Media uploaded — save to publish.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadTarget(null);
    }
  }

  function normalizeSlot(s: Slot): Record<string, unknown> {
    const targetUrl = (s.targetUrl ?? "").trim();
    return {
      enabled: s.enabled,
      targetUrl: targetUrl.length > 0 ? targetUrl : null,
      mediaUrl: s.mediaUrl?.trim() || null,
      mediaKind: s.mediaKind,
      title: s.title.trim(),
      subtitle: s.subtitle.trim(),
      ctaLabel: s.ctaLabel.trim(),
      discoverMixPercent: s.discoverMixPercent,
    };
  }

  async function save() {
    setSaving(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/admin/house-ads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discover: normalizeSlot(discover),
          gameEnd: normalizeSlot(gameEnd),
        }),
      });
      const json = (await res.json()) as Payload & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setDiscover({
        ...json.discover,
        targetUrl: json.discover.targetUrl ?? "",
      });
      setGameEnd({
        ...json.gameEnd,
        targetUrl: json.gameEnd.targetUrl ?? "",
      });
      setNote("Saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-[30px] font-bold text-[#1c1c1e]">House promos</h1>
        <p className="mt-1 text-sm text-[#6e6e6e]">
          Control Discover feed promos and the full-screen promo after a game ends (mobile).
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

      {loading ? (
        <div className="flex justify-center py-16">
          <ParfadeSpinner size="md" variant="muted" aria-label="Loading" />
        </div>
      ) : (
        <>
          <SlotFields
            label="Discover (inline feed)"
            slot={discover}
            onChange={setDiscover}
            showMix
            uploadBusy={uploadTarget === "discover"}
            onPickFile={(f) => void uploadFor("discover", f)}
          />
          <SlotFields
            label="After game (full screen)"
            slot={gameEnd}
            onChange={setGameEnd}
            showMix={false}
            uploadBusy={uploadTarget === "gameEnd"}
            onPickFile={(f) => void uploadFor("gameEnd", f)}
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="w-full rounded-xl bg-[#1a3c2a] py-3 text-center text-sm font-bold text-white disabled:opacity-50 sm:w-auto sm:px-10"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </>
      )}
    </section>
  );
}
