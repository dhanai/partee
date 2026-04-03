import "dotenv/config";
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next.js uses `.env.local` for DATABASE_URL; drizzle-kit CLI only loads `.env` by default.
config({ path: ".env.local", override: true });

// drizzle-kit picks drivers in order: `pg` → `postgres` → … → `@neondatabase/serverless`.
// With only `@neondatabase/serverless`, `migrate` often stalls on the websocket path; `pg` (devDependency) uses TCP and is reliable.
// Optional: Neon "direct" / non-pooler URL for migrations if pooled `DATABASE_URL` misbehaves.
const url =
  process.env.DATABASE_URL_MIGRATE?.trim() ||
  process.env.DIRECT_DATABASE_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  "";

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
