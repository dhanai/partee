/**
 * Idempotent: adds users.notifications_last_viewed_at if missing.
 * Use when Drizzle reports migrations applied but the column is still missing
 * (e.g. DB branch mismatch or __drizzle_migrations out of sync).
 */
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(process.cwd(), ".env.local"), override: true });
loadEnv();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Missing DATABASE_URL (.env or .env.local).");
}

const sql = neon(databaseUrl);

async function main() {
  await sql`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS notifications_last_viewed_at timestamptz
  `;
  console.log("users.notifications_last_viewed_at is present (added if it was missing).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
