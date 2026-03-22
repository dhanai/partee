import type { gameSessions } from "@/db/schema";
import { toIsoTimestamp } from "@/lib/utils";

type GameSessionRow = typeof gameSessions.$inferSelect;

export const toIso = toIsoTimestamp;

export function serializeGameSessionForApi(s: GameSessionRow) {
  return {
    id: s.id,
    gameType: s.gameType,
    createdBy: s.createdBy,
    roundId: s.roundId,
    status: s.status,
    holesCount: s.holesCount,
    settings: s.settings,
    startedAt: toIsoTimestamp(s.startedAt),
    endedAt: s.endedAt != null ? toIsoTimestamp(s.endedAt) : null,
    createdAt: toIsoTimestamp(s.createdAt),
    updatedAt: toIsoTimestamp(s.updatedAt),
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
