import "dotenv/config";
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next.js uses `.env.local` for DATABASE_URL; drizzle-kit CLI only loads `.env` by default.
config({ path: ".env.local", override: true });

// drizzle-kit picks drivers in order: `pg` → `postgres` → … → `@neondatabase/serverless`.
// With only `@neondatabase/serverless`, `migrate` often stalls on the websocket path; `pg` (devDependency) uses TCP and is reliable.
// Optional: Neon "direct" / non-pooler URL for migrations if pooled `DATABASE_URL` misbehaves.
const rawUrl =
  process.env.DATABASE_URL_MIGRATE?.trim() ||
  process.env.DIRECT_DATABASE_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  "";

/**
 * pg v8 warns when sslmode is missing or is require/prefer/verify-ca (aliases for verify-full today).
 * Neon URLs often use `sslmode=require`; normalizing avoids the deprecation noise during `db:migrate`.
 */
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

const url = normalizePgUrlForMigrate(rawUrl);

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url,
  },
  verbose: true,
  strict: true,
});
