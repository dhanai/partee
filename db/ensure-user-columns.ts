/**
 * Idempotent repairs for `users` columns that the app expects but that may be missing if:
 * - `npm run db:migrate` was never run on this database, or
 * - `__drizzle_migrations` is out of sync with the actual schema (branch swap, manual DB, etc.).
 */
import path, { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(process.cwd(), ".env.local"), override: true });
loadEnv();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Missing DATABASE_URL (.env or .env.local).");
}

const sql = neon(databaseUrl);

export async function repairUserColumns(): Promise<void> {
  await sql`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS notifications_last_viewed_at timestamptz
  `;
  await sql`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS expo_push_token text
  `;
  console.log(
    "users.notifications_last_viewed_at and users.expo_push_token are present (added if missing).",
  );
}

const invokedAsThisScript =
  process.argv[1] != null &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedAsThisScript) {
  repairUserColumns().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
