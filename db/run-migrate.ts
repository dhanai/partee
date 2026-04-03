/**
 * Run Drizzle SQL migrations using `pg` + drizzle-orm migrator (no drizzle-kit CLI).
 * drizzle-kit `migrate` often appears to hang after "Using 'pg' driver…" in some terminals;
 * this script logs progress and uses connection timeouts so failures surface quickly.
 */
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

const rawUrl =
  process.env.DATABASE_URL_MIGRATE?.trim() ||
  process.env.DIRECT_DATABASE_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  "";

function normalizePgUrlForMigrate(connectionString: string): string {
  const t = connectionString.trim();
  if (!t) return t;
  const local = /[@/]localhost\b|127\.0\.0\.1/.test(t);
  if (local) return t;

  let out = t.replace(/sslmode=(prefer|require|verify-ca)\b/gi, "sslmode=verify-full");
  if (!/[?&]sslmode=/i.test(out)) {
    out = out.includes("?") ? `${out}&sslmode=verify-full` : `${out}?sslmode=verify-full`;
  }
  return out;
}

function withConnectTimeout(connectionString: string): string {
  const t = connectionString.trim();
  if (!t || /[?&]connect_timeout=/i.test(t)) return t;
  return t.includes("?") ? `${t}&connect_timeout=20` : `${t}?connect_timeout=20`;
}

const url = withConnectTimeout(normalizePgUrlForMigrate(rawUrl));

if (!url) {
  console.error("Missing DATABASE_URL (set in .env.local, or DATABASE_URL_MIGRATE / DIRECT_DATABASE_URL).");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: url,
  max: 1,
  connectionTimeoutMillis: 25_000,
});

async function main() {
  console.log("[db:migrate] Testing connection (up to ~25s)…");
  await pool.query("select 1 as ok");
  console.log("[db:migrate] Connected. Applying migrations from db/migrations …");

  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: resolve(process.cwd(), "db/migrations") });

  await pool.end();
  console.log("[db:migrate] Done. Check row count: SELECT count(*) FROM drizzle.__drizzle_migrations;");
}

main().catch((e) => {
  console.error("[db:migrate] Failed:", e);
  void pool.end();
  process.exit(1);
});
