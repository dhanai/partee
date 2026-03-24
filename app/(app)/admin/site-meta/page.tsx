"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ParfadeSpinner } from "@/components/parfade-spinner";

type SiteMeta = {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  ogImageUrl: string | null;
  twitterTitle: string;
  twitterDescription: string;
  twitterImageUrl: string | null;
};

const emptyMeta = (): SiteMeta => ({
  title: "",
  description: "",
  ogTitle: "",
  ogDescription: "",
  ogImageUrl: null,
  twitterTitle: "",
  twitterDescription: "",
  twitterImageUrl: null,
});

function imageForPreview(value: string | null): string | null {
  const t = value?.trim() ?? "";
  return t.length > 0 ? t : null;
}

export default function AdminSiteMetaPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"og" | "twitter" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [meta, setMeta] = useState<SiteMeta>(() => emptyMeta());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/site-meta");
      const json = (await res.json()) as SiteMeta & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load");
      setMeta(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function uploadImage(target: "og" | "twitter", file: File) {
    setUploading(target);
    setError(null);
    setNote(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/admin/promo-media", { method: "POST", body: fd });
      const json = (await res.json()) as { url?: string; mediaKind?: "image" | "video"; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      if (json.mediaKind !== "image" || !json.url) throw new Error("Please upload an image file.");
      if (target === "og") {
        setMeta((current) => ({ ...current, ogImageUrl: json.url! }));
      } else {
        setMeta((current) => ({ ...current, twitterImageUrl: json.url! }));
      }
      setNote("Image uploaded. Save to publish.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  const payload = useMemo(
    () => ({
      ...meta,
      ogImageUrl: imageForPreview(meta.ogImageUrl),
      twitterImageUrl: imageForPreview(meta.twitterImageUrl),
    }),
    [meta],
  );

  async function save() {
    setSaving(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/admin/site-meta", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as SiteMeta & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setMeta(json);
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
        <h1 className="text-[30px] font-bold text-[#1c1c1e]">Site metadata</h1>
        <p className="mt-1 text-sm text-[#6e6e6e]">
          Manage global SEO and social share metadata (Open Graph and Twitter card defaults).
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
          <div className="space-y-4 rounded-xl border border-[#ece8e1] bg-white p-4 shadow-sm">
            <h2 className="text-lg font-bold text-[#1c1c1e]">Base metadata</h2>
            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">Title</span>
              <input
                value={meta.title}
                onChange={(e) => setMeta((s) => ({ ...s, title: e.target.value }))}
                className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">Description</span>
              <textarea
                rows={3}
                value={meta.description}
                onChange={(e) => setMeta((s) => ({ ...s, description: e.target.value }))}
                className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="space-y-4 rounded-xl border border-[#ece8e1] bg-white p-4 shadow-sm">
            <h2 className="text-lg font-bold text-[#1c1c1e]">Open Graph</h2>
            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">OG title</span>
              <input
                value={meta.ogTitle}
                onChange={(e) => setMeta((s) => ({ ...s, ogTitle: e.target.value }))}
                className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">OG description</span>
              <textarea
                rows={3}
                value={meta.ogDescription}
                onChange={(e) => setMeta((s) => ({ ...s, ogDescription: e.target.value }))}
                className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">OG image URL</span>
              <input
                type="url"
                value={meta.ogImageUrl ?? ""}
                onChange={(e) => setMeta((s) => ({ ...s, ogImageUrl: e.target.value }))}
                placeholder="https://…"
                className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
              />
            </label>
            <label className="inline-flex cursor-pointer rounded-lg border border-[#1a3c2a] bg-[#edf4ef] px-3 py-2 text-sm font-bold text-[#1a3c2a]">
              {uploading === "og" ? "Uploading…" : "Upload OG image"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
                disabled={uploading !== null}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void uploadImage("og", f);
                }}
              />
            </label>
            {imageForPreview(meta.ogImageUrl) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageForPreview(meta.ogImageUrl)!} alt="" className="max-h-56 rounded-lg object-cover" />
            ) : null}
          </div>

          <div className="space-y-4 rounded-xl border border-[#ece8e1] bg-white p-4 shadow-sm">
            <h2 className="text-lg font-bold text-[#1c1c1e]">Twitter card</h2>
            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">Twitter title</span>
              <input
                value={meta.twitterTitle}
                onChange={(e) => setMeta((s) => ({ ...s, twitterTitle: e.target.value }))}
                className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">Twitter description</span>
              <textarea
                rows={3}
                value={meta.twitterDescription}
                onChange={(e) => setMeta((s) => ({ ...s, twitterDescription: e.target.value }))}
                className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">Twitter image URL</span>
              <input
                type="url"
                value={meta.twitterImageUrl ?? ""}
                onChange={(e) => setMeta((s) => ({ ...s, twitterImageUrl: e.target.value }))}
                placeholder="https://…"
                className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
              />
            </label>
            <label className="inline-flex cursor-pointer rounded-lg border border-[#1a3c2a] bg-[#edf4ef] px-3 py-2 text-sm font-bold text-[#1a3c2a]">
              {uploading === "twitter" ? "Uploading…" : "Upload Twitter image"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
                disabled={uploading !== null}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void uploadImage("twitter", f);
                }}
              />
            </label>
            {imageForPreview(meta.twitterImageUrl) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageForPreview(meta.twitterImageUrl)!}
                alt=""
                className="max-h-56 rounded-lg object-cover"
              />
            ) : null}
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
