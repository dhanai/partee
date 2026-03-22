import type { gameSessions } from "@/db/schema";
import { toIsoTimestamp, toIsoTimestampOrNull } from "@/lib/utils";

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
    endedAt: toIsoTimestampOrNull(s.endedAt),
    createdAt: toIsoTimestamp(s.createdAt),
    updatedAt: toIsoTimestamp(s.updatedAt),
  };
}

function pgErrorCode(e: unknown): string | null {
  if (typeof e !== "object" || e === null || !("code" in e)) return null;
  const c = (e as { code?: unknown }).code;
  return typeof c === "string" ? c : null;
}

export function missingGamesSchemaMessage(e: unknown): string | null {
  if (pgErrorCode(e) === "42P01") {
    return "Games tables are missing. Run npm run db:migrate (migration 0012_games) on this database.";
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (/does not exist/i.test(msg) && /game_sessions/i.test(msg)) {
    return "Games tables are missing. Run npm run db:migrate (migration 0012_games) on this database.";
  }
  if (/42P01/.test(msg) && /game_/i.test(msg)) {
    return "Games tables are missing. Run npm run db:migrate (migration 0012_games) on this database.";
  }
  return null;
}
