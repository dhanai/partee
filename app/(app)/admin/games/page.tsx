"use client";

import { useCallback, useEffect, useState } from "react";
import { ParfadeSpinner } from "@/components/parfade-spinner";

type SettingsField = {
  key: string;
  label: string;
  type: "select" | "toggle";
  options?: string[];
  default?: string | boolean;
};

type GameTypeRow = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  enabled: boolean;
  sortOrder: number;
  minPlayers: number;
  maxPlayers: number;
  holesOptions: number[];
  scoringMode: string;
  standingsMode: string;
  hasTeams: boolean;
  teamFormation: string | null;
  settingsSchema: SettingsField[];
  defaultSettings: Record<string, unknown>;
};

const SCORING_MODES = ["pick_lowest", "wolf_pick", "enter_strokes"] as const;
const STANDINGS_MODES = ["skins_count", "wolf_points", "low_total", "stableford_points"] as const;
const TEAM_FORMATIONS = ["fixed", "wolf_rotation"] as const;

const EMPTY_FORM: Omit<GameTypeRow, "id"> = {
  slug: "",
  title: "",
  subtitle: "",
  description: "",
  enabled: true,
  sortOrder: 0,
  minPlayers: 2,
  maxPlayers: 8,
  holesOptions: [9, 18],
  scoringMode: "pick_lowest",
  standingsMode: "skins_count",
  hasTeams: false,
  teamFormation: null,
  settingsSchema: [],
  defaultSettings: {},
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export default function AdminGamesPage() {
  const [rows, setRows] = useState<GameTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [editing, setEditing] = useState<GameTypeRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Omit<GameTypeRow, "id">>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/game-types");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load");
      setRows(json as GameTypeRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setCreating(true);
    setForm({ ...EMPTY_FORM });
    setFormError(null);
  }

  function openEdit(row: GameTypeRow) {
    setCreating(false);
    setEditing(row);
    setForm({
      slug: row.slug,
      title: row.title,
      subtitle: row.subtitle,
      description: row.description,
      enabled: row.enabled,
      sortOrder: row.sortOrder,
      minPlayers: row.minPlayers,
      maxPlayers: row.maxPlayers,
      holesOptions: row.holesOptions,
      scoringMode: row.scoringMode,
      standingsMode: row.standingsMode,
      hasTeams: row.hasTeams,
      teamFormation: row.teamFormation,
      settingsSchema: row.settingsSchema,
      defaultSettings: row.defaultSettings,
    });
    setFormError(null);
  }

  function closeForm() {
    setCreating(false);
    setEditing(null);
    setFormError(null);
  }

  async function toggleEnabled(row: GameTypeRow) {
    try {
      const res = await fetch(`/api/admin/game-types/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !row.enabled }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "Failed");
      }
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, enabled: !r.enabled } : r)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not toggle");
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setFormError(null);
    setNote(null);
    try {
      if (creating) {
        const res = await fetch("/api/admin/game-types", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const json = await res.json();
        if (!res.ok) throw new Error((json as { error?: string }).error ?? "Create failed");
        setRows((prev) => [...prev, json as GameTypeRow]);
        setNote(`"${form.title}" created.`);
        closeForm();
      } else if (editing) {
        const res = await fetch(`/api/admin/game-types/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const json = await res.json();
        if (!res.ok) throw new Error((json as { error?: string }).error ?? "Update failed");
        setRows((prev) =>
          prev.map((r) => (r.id === editing.id ? (json as GameTypeRow) : r)),
        );
        setNote(`"${form.title}" updated.`);
        closeForm();
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  function addSettingsField() {
    setForm((prev) => ({
      ...prev,
      settingsSchema: [
        ...prev.settingsSchema,
        { key: "", label: "", type: "select" as const, options: [], default: "" },
      ],
    }));
  }

  function updateSettingsField(index: number, field: SettingsField) {
    setForm((prev) => ({
      ...prev,
      settingsSchema: prev.settingsSchema.map((f, i) => (i === index ? field : f)),
    }));
  }

  function removeSettingsField(index: number) {
    setForm((prev) => ({
      ...prev,
      settingsSchema: prev.settingsSchema.filter((_, i) => i !== index),
    }));
  }

  const showForm = creating || editing;

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-bold text-[#1c1c1e]">Games</h1>
          <p className="mt-1 text-sm text-[#6e6e6e]">
            Create, edit, and toggle game types. Changes are reflected in the mobile app without an update.
          </p>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={openCreate}
            className="shrink-0 rounded-xl bg-[#1a3c2a] px-5 py-2.5 text-sm font-bold text-white"
          >
            New game
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </div>
      )}
      {note && (
        <div className="rounded-xl border border-[#d9e8dc] bg-[#edf4ef] px-3 py-2 text-sm font-semibold text-[#1a3c2a]">
          {note}
        </div>
      )}

      {showForm && (
        <div className="space-y-5 rounded-xl border border-[#ece8e1] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#1c1c1e]">
              {creating ? "New game type" : `Edit: ${editing!.title}`}
            </h2>
            <button
              type="button"
              onClick={closeForm}
              className="text-sm font-semibold text-[#6e6e6e] hover:text-[#1c1c1e]"
            >
              Cancel
            </button>
          </div>

          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">Title</span>
              <input
                value={form.title}
                onChange={(e) => {
                  const title = e.target.value;
                  setForm((p) => ({
                    ...p,
                    title,
                    ...(creating ? { slug: slugify(title) } : {}),
                  }));
                }}
                className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">
                Slug {editing && "(read-only)"}
              </span>
              <input
                value={form.slug}
                onChange={(e) => creating && setForm((p) => ({ ...p, slug: slugify(e.target.value) }))}
                readOnly={!!editing}
                className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm font-mono disabled:opacity-50"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">Subtitle</span>
            <input
              value={form.subtitle}
              onChange={(e) => setForm((p) => ({ ...p, subtitle: e.target.value }))}
              className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">
              Description (how to play)
            </span>
            <textarea
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">
                Scoring mode
              </span>
              <select
                value={form.scoringMode}
                onChange={(e) => setForm((p) => ({ ...p, scoringMode: e.target.value }))}
                className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
              >
                {SCORING_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">
                Standings mode
              </span>
              <select
                value={form.standingsMode}
                onChange={(e) => setForm((p) => ({ ...p, standingsMode: e.target.value }))}
                className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
              >
                {STANDINGS_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">
                Min players
              </span>
              <input
                type="number"
                min={1}
                max={20}
                value={form.minPlayers}
                onChange={(e) => setForm((p) => ({ ...p, minPlayers: Number(e.target.value) }))}
                className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">
                Max players
              </span>
              <input
                type="number"
                min={1}
                max={20}
                value={form.maxPlayers}
                onChange={(e) => setForm((p) => ({ ...p, maxPlayers: Number(e.target.value) }))}
                className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">
                Sort order
              </span>
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm((p) => ({ ...p, sortOrder: Number(e.target.value) }))}
                className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
              />
            </label>
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">
                Holes
              </span>
              <div className="flex gap-3 pt-1">
                {[9, 18].map((n) => (
                  <label key={n} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={form.holesOptions.includes(n)}
                      onChange={(e) => {
                        setForm((p) => ({
                          ...p,
                          holesOptions: e.target.checked
                            ? [...p.holesOptions, n].sort()
                            : p.holesOptions.filter((h) => h !== n),
                        }));
                      }}
                    />
                    {n}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.hasTeams}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    hasTeams: e.target.checked,
                    teamFormation: e.target.checked ? p.teamFormation ?? "fixed" : null,
                  }))
                }
              />
              Has teams
            </label>
            {form.hasTeams && (
              <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">
                  Team formation
                </span>
                <select
                  value={form.teamFormation ?? "fixed"}
                  onChange={(e) => setForm((p) => ({ ...p, teamFormation: e.target.value }))}
                  className="rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
                >
                  {TEAM_FORMATIONS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))}
              />
              Enabled
            </label>
          </div>

          {/* Settings schema builder */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">
                Settings schema
              </span>
              <button
                type="button"
                onClick={addSettingsField}
                className="text-xs font-semibold text-[#1a3c2a]"
              >
                + Add field
              </button>
            </div>
            {form.settingsSchema.length === 0 && (
              <p className="text-xs text-[#999]">No settings fields. Players will see defaults only.</p>
            )}
            {form.settingsSchema.map((field, i) => (
              <div
                key={i}
                className="flex flex-wrap items-end gap-2 rounded-lg border border-[#ece8e1] bg-[#faf8f5] p-3"
              >
                <label className="block space-y-0.5">
                  <span className="text-[11px] text-[#6e6e6e]">Key</span>
                  <input
                    value={field.key}
                    onChange={(e) => updateSettingsField(i, { ...field, key: e.target.value })}
                    className="w-28 rounded border border-[#ece8e1] px-2 py-1 text-xs font-mono"
                  />
                </label>
                <label className="block space-y-0.5">
                  <span className="text-[11px] text-[#6e6e6e]">Label</span>
                  <input
                    value={field.label}
                    onChange={(e) => updateSettingsField(i, { ...field, label: e.target.value })}
                    className="w-36 rounded border border-[#ece8e1] px-2 py-1 text-xs"
                  />
                </label>
                <label className="block space-y-0.5">
                  <span className="text-[11px] text-[#6e6e6e]">Type</span>
                  <select
                    value={field.type}
                    onChange={(e) =>
                      updateSettingsField(i, { ...field, type: e.target.value as "select" | "toggle" })
                    }
                    className="rounded border border-[#ece8e1] px-2 py-1 text-xs"
                  >
                    <option value="select">select</option>
                    <option value="toggle">toggle</option>
                  </select>
                </label>
                {field.type === "select" && (
                  <label className="block space-y-0.5">
                    <span className="text-[11px] text-[#6e6e6e]">Options (comma sep)</span>
                    <input
                      value={(field.options ?? []).join(",")}
                      onChange={(e) =>
                        updateSettingsField(i, {
                          ...field,
                          options: e.target.value
                            .split(",")
                            .map((o) => o.trim())
                            .filter(Boolean),
                        })
                      }
                      className="w-36 rounded border border-[#ece8e1] px-2 py-1 text-xs"
                    />
                  </label>
                )}
                <label className="block space-y-0.5">
                  <span className="text-[11px] text-[#6e6e6e]">Default</span>
                  <input
                    value={String(field.default ?? "")}
                    onChange={(e) => updateSettingsField(i, { ...field, default: e.target.value })}
                    className="w-24 rounded border border-[#ece8e1] px-2 py-1 text-xs"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeSettingsField(i)}
                  className="text-xs font-semibold text-red-600"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            disabled={submitting || !form.title.trim() || !form.slug.trim() || !form.subtitle.trim()}
            onClick={() => void handleSubmit()}
            className="rounded-xl bg-[#1a3c2a] px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {submitting ? "Saving…" : creating ? "Create game type" : "Save changes"}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <ParfadeSpinner size="md" variant="muted" aria-label="Loading" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[#6e6e6e]">No game types found.</p>
      ) : (
        <div className="space-y-2">
          {rows
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((row) => (
              <div
                key={row.id}
                className="flex items-center gap-3 rounded-xl border border-[#ece8e1] bg-white px-4 py-3 shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-[#1c1c1e]">{row.title}</p>
                    <span className="font-mono text-xs text-[#999]">{row.slug}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        row.enabled
                          ? "bg-[#edf4ef] text-[#1a3c2a]"
                          : "bg-[#f5f5f5] text-[#999]"
                      }`}
                    >
                      {row.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[#6e6e6e]">
                    {row.minPlayers}–{row.maxPlayers} players · {row.scoringMode} ·{" "}
                    {row.standingsMode}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void toggleEnabled(row)}
                  className="shrink-0 rounded-lg border border-[#ece8e1] px-3 py-1.5 text-xs font-semibold text-[#1c1c1e] hover:bg-[#faf8f5]"
                >
                  {row.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(row)}
                  className="shrink-0 rounded-lg border border-[#ece8e1] px-3 py-1.5 text-xs font-semibold text-[#1a3c2a] hover:bg-[#edf4ef]"
                >
                  Edit
                </button>
              </div>
            ))}
        </div>
      )}
    </section>
  );
}
