import type { gameSessions } from "@/db/schema";

type GameSessionRow = typeof gameSessions.$inferSelect;

/** Neon / some drivers return timestamptz as strings; Drizzle types may still say Date. */
export function toIso(v: Date | string): string {
  if (v instanceof Date) return v.toISOString();
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new TypeError("Invalid timestamp from database");
  return d.toISOString();
}

export function serializeGameSessionForApi(s: GameSessionRow) {
  return {
    id: s.id,
    gameType: s.gameType,
    createdBy: s.createdBy,
    roundId: s.roundId,
    status: s.status,
    holesCount: s.holesCount,
    settings: s.settings,
    startedAt: toIso(s.startedAt),
    endedAt: s.endedAt != null ? toIso(s.endedAt) : null,
    createdAt: toIso(s.createdAt),
    updatedAt: toIso(s.updatedAt),
  };
}

export function missingGamesSchemaMessage(e: unknown): string | null {
  const msg = e instanceof Error ? e.message : String(e);
  if (/does not exist/i.test(msg) && /game_sessions/i.test(msg)) {
    return "Games tables are missing. Run npm run db:migrate (migration 0012_games) on this database.";
  }
  if (/42P01/.test(msg) && /game_/i.test(msg)) {
    return "Games tables are missing. Run npm run db:migrate (migration 0012_games) on this database.";
  }
  return null;
}
