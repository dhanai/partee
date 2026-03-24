"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ParfadeSpinner } from "@/components/parfade-spinner";

type PageKey = "home" | "support" | "privacy";

type HomeContent = {
  heroEyebrow: string;
  heroTitle: string;
  heroDescription: string;
  ctaWebLabel: string;
  ctaAppLabel: string;
};

type SupportContent = {
  title: string;
  intro: string;
  contactHeading: string;
  contactBlurb: string;
};

type PrivacyContent = {
  title: string;
  intro: string;
  effectiveDate: string;
};

const pages: Array<{ key: PageKey; label: string }> = [
  { key: "home", label: "Home" },
  { key: "support", label: "Support" },
  { key: "privacy", label: "Privacy" },
];

export default function AdminContentPage() {
  const [page, setPage] = useState<PageKey>("home");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [home, setHome] = useState<HomeContent | null>(null);
  const [support, setSupport] = useState<SupportContent | null>(null);
  const [privacy, setPrivacy] = useState<PrivacyContent | null>(null);

  const load = useCallback(async (target: PageKey) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/page-content?page=${target}`);
      const json = (await res.json()) as {
        content?: HomeContent | SupportContent | PrivacyContent;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Could not load page content.");
      if (target === "home") setHome(json.content as HomeContent);
      if (target === "support") setSupport(json.content as SupportContent);
      if (target === "privacy") setPrivacy(json.content as PrivacyContent);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load page content.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  const payload = useMemo(() => {
    if (page === "home") return home;
    if (page === "support") return support;
    return privacy;
  }, [home, page, privacy, support]);

  async function save() {
    if (!payload) return;
    setSaving(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/admin/page-content?page=${page}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as {
        content?: HomeContent | SupportContent | PrivacyContent;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Could not save content.");
      if (page === "home") setHome(json.content as HomeContent);
      if (page === "support") setSupport(json.content as SupportContent);
      if (page === "privacy") setPrivacy(json.content as PrivacyContent);
      setNote("Saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save content.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-[30px] font-bold text-[#1c1c1e]">Content</h1>
        <p className="mt-1 text-sm text-[#6e6e6e]">
          Manage copy for your public pages without code changes.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {pages.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPage(p.key)}
            className={
              page === p.key
                ? "rounded-full border border-[#1a3c2a] bg-[#edf4ef] px-3 py-1.5 text-xs font-bold text-[#1a3c2a]"
                : "rounded-full border border-[#ece8e1] bg-white px-3 py-1.5 text-xs font-semibold text-[#494949]"
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</div>
      ) : null}
      {note ? (
        <div className="rounded-xl border border-[#d9e8dc] bg-[#edf4ef] px-3 py-2 text-sm font-semibold text-[#1a3c2a]">
          {note}
        </div>
      ) : null}

      {loading || !payload ? (
        <div className="flex justify-center py-16">
          <ParfadeSpinner size="md" variant="muted" aria-label="Loading" />
        </div>
      ) : page === "home" ? (
        <div className="space-y-4 rounded-xl border border-[#ece8e1] bg-white p-4 shadow-sm">
          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">Hero eyebrow</span>
            <input
              value={home?.heroEyebrow ?? ""}
              onChange={(e) => setHome((s) => ({ ...(s as HomeContent), heroEyebrow: e.target.value }))}
              className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">Hero title</span>
            <input
              value={home?.heroTitle ?? ""}
              onChange={(e) => setHome((s) => ({ ...(s as HomeContent), heroTitle: e.target.value }))}
              className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">Hero description</span>
            <textarea
              rows={4}
              value={home?.heroDescription ?? ""}
              onChange={(e) => setHome((s) => ({ ...(s as HomeContent), heroDescription: e.target.value }))}
              className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">Web CTA label</span>
              <input
                value={home?.ctaWebLabel ?? ""}
                onChange={(e) => setHome((s) => ({ ...(s as HomeContent), ctaWebLabel: e.target.value }))}
                className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">App CTA label</span>
              <input
                value={home?.ctaAppLabel ?? ""}
                onChange={(e) => setHome((s) => ({ ...(s as HomeContent), ctaAppLabel: e.target.value }))}
                className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="w-full rounded-xl bg-[#1a3c2a] py-3 text-center text-sm font-bold text-white disabled:opacity-50 sm:w-auto sm:px-10"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      ) : page === "support" ? (
        <div className="space-y-4 rounded-xl border border-[#ece8e1] bg-white p-4 shadow-sm">
          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">Page title</span>
            <input
              value={support?.title ?? ""}
              onChange={(e) => setSupport((s) => ({ ...(s as SupportContent), title: e.target.value }))}
              className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">Intro</span>
            <textarea
              rows={3}
              value={support?.intro ?? ""}
              onChange={(e) => setSupport((s) => ({ ...(s as SupportContent), intro: e.target.value }))}
              className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">Contact heading</span>
            <input
              value={support?.contactHeading ?? ""}
              onChange={(e) =>
                setSupport((s) => ({ ...(s as SupportContent), contactHeading: e.target.value }))
              }
              className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">Contact blurb</span>
            <textarea
              rows={3}
              value={support?.contactBlurb ?? ""}
              onChange={(e) =>
                setSupport((s) => ({ ...(s as SupportContent), contactBlurb: e.target.value }))
              }
              className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="w-full rounded-xl bg-[#1a3c2a] py-3 text-center text-sm font-bold text-white disabled:opacity-50 sm:w-auto sm:px-10"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-[#ece8e1] bg-white p-4 shadow-sm">
          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">Page title</span>
            <input
              value={privacy?.title ?? ""}
              onChange={(e) => setPrivacy((s) => ({ ...(s as PrivacyContent), title: e.target.value }))}
              className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">Effective date</span>
            <input
              value={privacy?.effectiveDate ?? ""}
              onChange={(e) => setPrivacy((s) => ({ ...(s as PrivacyContent), effectiveDate: e.target.value }))}
              className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">Intro</span>
            <textarea
              rows={4}
              value={privacy?.intro ?? ""}
              onChange={(e) => setPrivacy((s) => ({ ...(s as PrivacyContent), intro: e.target.value }))}
              className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="w-full rounded-xl bg-[#1a3c2a] py-3 text-center text-sm font-bold text-white disabled:opacity-50 sm:w-auto sm:px-10"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      )}
    </section>
  );
}
