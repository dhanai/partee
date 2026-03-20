import "dotenv/config";
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next.js uses `.env.local` for DATABASE_URL; drizzle-kit CLI only loads `.env` by default.
config({ path: ".env.local", override: true });

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  verbose: true,
  strict: true,
});
