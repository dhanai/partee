import { sql } from "drizzle-orm";
import { db } from "@/db";
import { rounds } from "@/db/schema";

export type RoundsDbCapabilities = {
  hasTournamentModeEnum: boolean;
  hasTournamentCopyColumns: boolean;
};

let cache: RoundsDbCapabilities | null = null;

function firstRow(result: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(result) && result.length > 0) {
    return result[0] as Record<string, unknown>;
  }
  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray((result as { rows: unknown[] }).rows) &&
    (result as { rows: unknown[] }).rows.length > 0
  ) {
    return (result as { rows: Record<string, unknown>[] }).rows[0];
  }
  return undefined;
}

/**
 * Cached per server instance. Detects whether tournament-related DB migrations
 * have been applied so we can avoid referencing missing enum values or columns.
 */
export async function getRoundsDbCapabilities(): Promise<RoundsDbCapabilities> {
  if (cache) {
    return cache;
  }

  const [enumRow, colRow] = await Promise.all([
    db.execute(sql`
      SELECT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'round_mode' AND e.enumlabel = 'tournament'
      ) AS ok
    `),
    db.execute(sql`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'rounds'
          AND column_name = 'tournament_title'
      ) AS ok
    `),
  ]);

  const e = firstRow(enumRow);
  const c = firstRow(colRow);
  cache = {
    hasTournamentModeEnum: Boolean(e?.ok),
    hasTournamentCopyColumns: Boolean(c?.ok),
  };
  return cache;
}

/** Columns returned from INSERT … RETURNING when tournament copy columns may be absent. */
export function roundInsertReturningFields(hasTournamentCopyColumns: boolean) {
  const base = {
    id: rounds.id,
    hostId: rounds.hostId,
    mode: rounds.mode,
    courseId: rounds.courseId,
    courseName: rounds.courseName,
    teeTime: rounds.teeTime,
    targetDate: rounds.targetDate,
    preferredTimeWindow: rounds.preferredTimeWindow,
    planningLocation: rounds.planningLocation,
    totalSpots: rounds.totalSpots,
    visibility: rounds.visibility,
    status: rounds.status,
    joinPolicy: rounds.joinPolicy,
    customImageUrl: rounds.customImageUrl,
    groupId: rounds.groupId,
    inviteToken: rounds.inviteToken,
    createdAt: rounds.createdAt,
  };
  if (!hasTournamentCopyColumns) {
    return base;
  }
  return {
    ...base,
    tournamentTitle: rounds.tournamentTitle,
    tournamentDetails: rounds.tournamentDetails,
  };
}
