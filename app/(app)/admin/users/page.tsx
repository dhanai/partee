"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ParfadeSpinner } from "@/components/parfade-spinner";

type UserRow = {
  id: string;
  name: string;
  email: string | null;
  avatar: string | null;
  createdAt: string;
  followVisibility: "public" | "private";
  hideHostedRoundsFromDiscover: boolean;
  isAdmin: boolean;
  hasPushToken: boolean;
  hostedRoundsCount: number;
};

function dateLabel(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleDateString();
}

export default function AdminUsersPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const fetchUrl = useMemo(() => {
    const q = query.trim();
    return q.length > 0 ? `/api/admin/users?q=${encodeURIComponent(q)}&limit=100` : "/api/admin/users?limit=60";
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(fetchUrl);
      const json = (await res.json()) as {
        users?: UserRow[];
        currentUserId?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Could not load users");
      setUsers(json.users ?? []);
      setCurrentUserId(json.currentUserId ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load users");
    } finally {
      setLoading(false);
    }
  }, [fetchUrl]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function patchUser(id: string, body: Record<string, unknown>, successMessage: string) {
    setSavingUserId(id);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        error?: string;
        user?: {
          id: string;
          name: string;
          followVisibility: "public" | "private";
          hideHostedRoundsFromDiscover: boolean;
          isAdmin: boolean;
        };
      };
      if (!res.ok) throw new Error(json.error ?? "Could not save");
      if (json.user) {
        setUsers((list) =>
          list.map((u) =>
            u.id === json.user!.id
              ? {
                  ...u,
                  name: json.user!.name,
                  followVisibility: json.user!.followVisibility,
                  hideHostedRoundsFromDiscover: json.user!.hideHostedRoundsFromDiscover,
                  isAdmin: json.user!.isAdmin,
                  hasPushToken:
                    body.clearPushToken === true ? false : u.hasPushToken,
                }
              : u,
          ),
        );
      }
      setNote(successMessage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSavingUserId(null);
    }
  }

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) ?? null,
    [selectedUserId, users],
  );

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-[30px] font-bold text-[#1c1c1e]">Users</h1>
        <p className="mt-1 text-sm text-[#6e6e6e]">
          Search accounts and manage access, visibility, and push token hygiene.
        </p>
      </div>

      <div className="rounded-xl border border-[#ece8e1] bg-white p-4 shadow-sm">
        <label className="block space-y-1">
          <span className="text-xs font-bold uppercase tracking-wide text-[#6e6e6e]">Search users</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name or email"
            className="w-full rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm"
          />
        </label>
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
        <div className="relative">
          <div>
            <div className="space-y-2">
              {users.map((user) => {
                const selected = user.id === selectedUserId;
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => setSelectedUserId(user.id)}
                    className={
                      selected
                        ? "w-full rounded-xl border border-[#1a3c2a] bg-[#edf4ef] p-4 text-left"
                        : "w-full rounded-xl border border-[#ece8e1] bg-white p-4 text-left shadow-sm transition hover:border-[#d8d3cb]"
                    }
                  >
                    <p className="truncate text-base font-bold text-[#1c1c1e]">{user.name}</p>
                    <p className="truncate text-sm text-[#6e6e6e]">{user.email ?? "No email"}</p>
                    <p className="mt-1 text-xs text-[#6e6e6e]">
                      Joined {dateLabel(user.createdAt)} · Hosted rounds {user.hostedRoundsCount}
                    </p>
                  </button>
                );
              })}
              {users.length === 0 ? (
                <div className="rounded-xl border border-[#ece8e1] bg-white p-6 text-sm text-[#6e6e6e]">
                  No users found.
                </div>
              ) : null}
            </div>
          </div>

          {selectedUser ? (
            <>
              <button
                type="button"
                aria-label="Close user drawer"
                onClick={() => setSelectedUserId(null)}
                className="fixed inset-0 z-30 bg-black/25 xl:hidden"
              />
              <aside className="fixed inset-y-0 right-0 z-40 h-dvh w-full max-w-[360px] overflow-y-auto border-l border-[#ece8e1] bg-white p-5 shadow-[-10px_0_30px_rgba(0,0,0,0.08)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-[#1c1c1e]">{selectedUser.name}</p>
                    <p className="text-sm text-[#6e6e6e]">{selectedUser.email ?? "No email"}</p>
                    <p className="mt-1 text-xs text-[#6e6e6e]">
                      Push token {selectedUser.hasPushToken ? "present" : "missing"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-md border border-[#ece8e1] px-2 py-1 text-xs font-semibold"
                    onClick={() => setSelectedUserId(null)}
                  >
                    Close
                  </button>
                </div>
                <div className="mt-5 space-y-3">
                  <label className="flex items-center justify-between rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm">
                    <span>Admin access</span>
                    <input
                      type="checkbox"
                      checked={selectedUser.isAdmin}
                      disabled={
                        savingUserId === selectedUser.id ||
                        (selectedUser.id === currentUserId && selectedUser.isAdmin)
                      }
                      onChange={(e) =>
                        void patchUser(
                          selectedUser.id,
                          { isAdmin: e.target.checked },
                          e.target.checked ? "Admin access granted." : "Admin access removed.",
                        )
                      }
                      className="h-4 w-4 rounded border-[#ece8e1] text-[#1a3c2a] focus:ring-[#1a3c2a]"
                    />
                  </label>
                  <label className="flex items-center justify-between rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm">
                    <span>Follow visibility</span>
                    <select
                      value={selectedUser.followVisibility}
                      disabled={savingUserId === selectedUser.id}
                      onChange={(e) =>
                        void patchUser(
                          selectedUser.id,
                          { followVisibility: e.target.value },
                          "User visibility updated.",
                        )
                      }
                      className="rounded border border-[#d6d1c9] bg-white px-2 py-1 text-xs"
                    >
                      <option value="public">Public</option>
                      <option value="private">Private</option>
                    </select>
                  </label>
                  <label className="flex items-center justify-between rounded-lg border border-[#ece8e1] bg-[#faf8f5] px-3 py-2 text-sm">
                    <span>Hide hosted rounds in discover</span>
                    <input
                      type="checkbox"
                      checked={selectedUser.hideHostedRoundsFromDiscover}
                      disabled={savingUserId === selectedUser.id}
                      onChange={(e) =>
                        void patchUser(
                          selectedUser.id,
                          { hideHostedRoundsFromDiscover: e.target.checked },
                          "Discover visibility updated.",
                        )
                      }
                      className="h-4 w-4 rounded border-[#ece8e1] text-[#1a3c2a] focus:ring-[#1a3c2a]"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={savingUserId === selectedUser.id || !selectedUser.hasPushToken}
                    onClick={() =>
                      void patchUser(selectedUser.id, { clearPushToken: true }, "Cleared user's push token.")
                    }
                    className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50"
                  >
                    {savingUserId === selectedUser.id ? "Saving..." : "Clear push token"}
                  </button>
                </div>
              </aside>
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}
