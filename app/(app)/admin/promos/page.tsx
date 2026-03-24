"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ParfadeSpinner } from "@/components/parfade-spinner";

type Slot = {
  enabled: boolean;
  ads: Array<{
    targetUrl: string | null;
    mediaUrl: string | null;
    mediaKind: "image" | "video" | null;
    title: string;
    subtitle: string;
    ctaLabel: string;
  }>;
  discoverMixPercent: number;
};

type Payload = { discover: Slot; gameEnd: Slot };

const emptySlot = (): Slot => ({
  enabled: false,
  ads: [
    {
      targetUrl: "",
      mediaUrl: null,
      mediaKind: null,
      title: "",
      subtitle: "",
      ctaLabel: "",
    },
  ],
  discoverMixPercent: 0,
});

function SlotFields({
  label,
  slot,
  onChange,
  showMix,
  uploadBusyAt,
  onPickFile,
}: {
  label: string;
  slot: Slot;
  onChange: (next: Slot) => void;
  showMix: boolean;
  uploadBusyAt: number | null;
  onPickFile: (adIndex: number, file: File) => void;
}) {
  const adRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [pendingScrollIndex, setPendingScrollIndex] = useState<number | null>(null);

  useEffect(() => {
    if (pendingScrollIndex == null) return;
    const el = adRefs.current[pendingScrollIndex];
    if (!el) return;
    const raf = window.requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      setPendingScrollIndex(null);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [pendingScrollIndex, slot.ads.length]);

  function updateAd(index: number, patch: Partial<Slot["ads"][number]>) {
    onChange({
      ...slot,
      ads: slot.ads.map((ad, i) => (i === index ? { ...ad, ...patch } : ad)),
    });
  }

  function removeAd(index: number) {
    if (slot.ads.length <= 1) return;
    onChange({ ...slot, ads: slot.ads.filter((_, i) => i !== index) });
  }

  function addAd() {
    const nextIndex = slot.ads.length;
    setPendingScrollIndex(nextIndex);
    onChange({
      ...slot,
      ads: [
        ...slot.ads,
        {
          targetUrl: "",
          mediaUrl: null,
          mediaKind: null,
          title: "",
          subtitle: "",
          ctaLabel: "",
        },
      ],
    });
  }

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

      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">Ads in this placement</p>
        {slot.ads.map((ad, adIndex) => (
          <div
            key={`${label}-ad-${adIndex}`}
            ref={(el) => {
              adRefs.current[adIndex] = el;
            }}
            className="space-y-3 rounded-lg border border-[#ece8e1] bg-[#faf8f5] p-3"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-[#1c1c1e]">Ad {adIndex + 1}</p>
              {slot.ads.length > 1 ? (
                <button
                  type="button"
                  className="text-xs font-semibold text-red-700 underline"
                  onClick={() => removeAd(adIndex)}
                >
                  Remove
                </button>
              ) : null}
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">Tap / swipe-up URL</span>
              <input
                type="url"
                value={ad.targetUrl ?? ""}
                onChange={(e) => updateAd(adIndex, { targetUrl: e.target.value })}
                placeholder="https://…"
                className="w-full rounded-lg border border-[#ece8e1] bg-white px-3 py-2 text-sm"
              />
            </label>
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">Media (photo or video)</span>
              <div className="flex flex-wrap items-center gap-2">
                <label className="cursor-pointer rounded-lg border border-[#1a3c2a] bg-[#edf4ef] px-3 py-2 text-sm font-bold text-[#1a3c2a]">
                  {uploadBusyAt === adIndex ? "Uploading…" : "Upload file"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,.mp4,.mov"
                    className="hidden"
                    disabled={uploadBusyAt !== null}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) onPickFile(adIndex, f);
                    }}
                  />
                </label>
                {ad.mediaUrl ? (
                  <button
                    type="button"
                    className="text-sm font-semibold text-red-700 underline"
                    onClick={() => updateAd(adIndex, { mediaUrl: null, mediaKind: null })}
                  >
                    Clear media
                  </button>
                ) : null}
              </div>
              {ad.mediaUrl ? <p className="break-all text-xs text-[#6e6e6e]">{ad.mediaUrl}</p> : null}
              {ad.mediaKind === "video" && ad.mediaUrl ? (
                <video src={ad.mediaUrl} controls className="mt-2 h-auto w-full rounded-lg bg-black" />
              ) : null}
              {ad.mediaKind === "image" && ad.mediaUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ad.mediaUrl} alt="" className="mt-2 h-auto w-full rounded-lg" />
              ) : null}
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">Title</span>
              <input
                value={ad.title}
                onChange={(e) => updateAd(adIndex, { title: e.target.value })}
                className="w-full rounded-lg border border-[#ece8e1] bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">Subtitle</span>
              <textarea
                value={ad.subtitle}
                onChange={(e) => updateAd(adIndex, { subtitle: e.target.value })}
                rows={2}
                className="w-full rounded-lg border border-[#ece8e1] bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">Button / CTA label</span>
              <input
                value={ad.ctaLabel}
                onChange={(e) => updateAd(adIndex, { ctaLabel: e.target.value })}
                placeholder="Shop now · Swipe up"
                className="w-full rounded-lg border border-[#ece8e1] bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>
        ))}
        <button
          type="button"
          onClick={addAd}
          className="rounded-lg border border-[#1a3c2a] bg-[#edf4ef] px-2.5 py-1 text-xs font-bold text-[#1a3c2a]"
        >
          + Add ad
        </button>
      </div>
    </div>
  );
}

export default function AdminPromosPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<{ slot: "discover" | "gameEnd"; adIndex: number } | null>(null);
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
      setDiscover({ ...json.discover, ads: json.discover.ads?.length ? json.discover.ads : emptySlot().ads });
      setGameEnd({ ...json.gameEnd, ads: json.gameEnd.ads?.length ? json.gameEnd.ads : emptySlot().ads });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function uploadFor(target: "discover" | "gameEnd", adIndex: number, file: File) {
    setUploadTarget({ slot: target, adIndex });
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/admin/promo-media", { method: "POST", body: fd });
      const json = (await res.json()) as { url?: string; mediaKind?: "image" | "video"; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      if (!json.url || !json.mediaKind) throw new Error("Bad upload response");
      const apply = (s: Slot) => ({
        ...s,
        ads: s.ads.map((ad, i) => (i === adIndex ? { ...ad, mediaUrl: json.url!, mediaKind: json.mediaKind! } : ad)),
      });
      if (target === "discover") setDiscover((s) => apply(s));
      else setGameEnd((s) => apply(s));
      setNote("Media uploaded — save to publish.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadTarget(null);
    }
  }

  function normalizeSlot(s: Slot): Record<string, unknown> {
    return {
      enabled: s.enabled,
      ads: s.ads.map((ad) => ({
        targetUrl: ad.targetUrl?.trim() || null,
        mediaUrl: ad.mediaUrl?.trim() || null,
        mediaKind: ad.mediaKind,
        title: ad.title.trim(),
        subtitle: ad.subtitle.trim(),
        ctaLabel: ad.ctaLabel.trim(),
      })),
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
      setDiscover({ ...json.discover, ads: json.discover.ads?.length ? json.discover.ads : emptySlot().ads });
      setGameEnd({ ...json.gameEnd, ads: json.gameEnd.ads?.length ? json.gameEnd.ads : emptySlot().ads });
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
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <SlotFields
              label="Discover (inline feed)"
              slot={discover}
              onChange={setDiscover}
              showMix
              uploadBusyAt={uploadTarget?.slot === "discover" ? uploadTarget.adIndex : null}
              onPickFile={(adIndex, f) => void uploadFor("discover", adIndex, f)}
            />
            <SlotFields
              label="After game (full screen)"
              slot={gameEnd}
              onChange={setGameEnd}
              showMix={false}
              uploadBusyAt={uploadTarget?.slot === "gameEnd" ? uploadTarget.adIndex : null}
              onPickFile={(adIndex, f) => void uploadFor("gameEnd", adIndex, f)}
            />
          </div>
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
