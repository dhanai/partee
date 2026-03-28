/**
 * Backward-compatible helpers for the preferred_time_window column migration
 * from a single enum to a text[] array.
 *
 * API responses include BOTH fields so old mobile clients (expecting a string)
 * and new clients (expecting an array) can coexist during the rollout window.
 */

/** Spread into every round response object in place of `preferredTimeWindow`. */
export function timeWindowResponseFields(dbValue: string[] | null) {
  return {
    preferredTimeWindow: dbValue?.[0] ?? null,
    preferredTimeWindows: dbValue ?? null,
  } as const;
}

/** Normalize API input that may be a single string (old app) or array (new app). */
export function normalizeTimeWindowInput(
  val: string | string[] | null | undefined,
): string[] | null {
  if (!val) return null;
  if (typeof val === "string") return [val];
  return val.length > 0 ? val : null;
}

/**
 * Build a Drizzle SQL expression for a text[] value.
 * Neon's poolQueryViaFetch HTTP path doesn't serialise JS arrays
 * into PostgreSQL array params, so we construct an explicit ARRAY[] literal.
 */
import { sql, type SQL } from "drizzle-orm";

export function textArraySql(arr: string[] | null): SQL | null {
  if (!arr || arr.length === 0) return null;
  return sql`ARRAY[${sql.join(arr.map((v) => sql`${v}`), sql`, `)}]::text[]`;
}
