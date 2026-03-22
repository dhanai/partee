import { z } from "zod";

/** Persisted under `game_sessions.settings.guestPlayers`. */
export type GuestPlayerStored = {
  id: string;
  name: string;
};

export type SessionPlayerRow = {
  userId: string;
  sortOrder: number;
  teamId: string | null;
  name: string;
  avatar: string | null;
  isGuest: boolean;
};

export function parseGuestPlayersFromSettings(
  settings: Record<string, unknown> | null | undefined,
): GuestPlayerStored[] {
  const raw = settings?.guestPlayers;
  if (!Array.isArray(raw)) return [];
  const out: GuestPlayerStored[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const id = (item as { id?: unknown }).id;
    const name = (item as { name?: unknown }).name;
    if (typeof id !== "string" || !z.string().uuid().safeParse(id).success) continue;
    if (typeof name !== "string") continue;
    const trimmed = name.trim().slice(0, 80);
    if (!trimmed) continue;
    out.push({ id, name: trimmed });
  }
  return out;
}

type DbPlayerRow = {
  userId: string;
  sortOrder: number;
  teamId: string | null;
  name: string;
  avatar: string | null;
};

export function mergeDbPlayersWithGuests(
  dbRows: DbPlayerRow[],
  guests: GuestPlayerStored[],
): SessionPlayerRow[] {
  const baseMax = dbRows.reduce((m, r) => Math.max(m, r.sortOrder), -1);
  const registered = dbRows.map((r) => ({ ...r, isGuest: false as const }));
  const guestRows: SessionPlayerRow[] = guests.map((g, i) => ({
    userId: g.id,
    sortOrder: baseMax + 1 + i,
    teamId: null,
    name: g.name,
    avatar: null,
    isGuest: true,
  }));
  return [...registered, ...guestRows].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.userId.localeCompare(b.userId),
  );
}

export function buildGuestPlayersFromNames(names: string[]): GuestPlayerStored[] {
  const out: GuestPlayerStored[] = [];
  for (const raw of names) {
    const name = typeof raw === "string" ? raw.trim().slice(0, 80) : "";
    if (!name) continue;
    out.push({ id: crypto.randomUUID(), name });
  }
  return out;
}
