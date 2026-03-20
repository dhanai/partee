import path from "node:path";
import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/neon-serverless";
import { like } from "drizzle-orm";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import { users } from "./schema";

const DEV_PREFIX = "dev_seed_";
const DEFAULT_COUNT = 40;

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
loadEnv();

function parseCount() {
  const fromEnv = Number(process.env.DEV_SEED_USER_COUNT ?? `${DEFAULT_COUNT}`);
  if (!Number.isFinite(fromEnv) || fromEnv < 1) return DEFAULT_COUNT;
  return Math.min(200, Math.trunc(fromEnv));
}

function assertSafeToRun() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed users in production.");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL. Add it to your env before seeding.");
  }
  return databaseUrl;
}

function buildUser(index: number) {
  const n = index + 1;
  const label = `${n}`.padStart(3, "0");
  return {
    clerkId: `${DEV_PREFIX}${label}`,
    email: `dev.user.${label}@partee.local`,
    name: `Dev Golfer ${label}`,
    avatar: null as string | null,
    homeCourse: "Los Angeles, CA",
  };
}

async function clearSeedUsers(db: ReturnType<typeof drizzle>) {
  await db.delete(users).where(like(users.clerkId, `${DEV_PREFIX}%`));
  const remaining = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.clerkId, `${DEV_PREFIX}%`));
  console.log(`Cleared dev users. Remaining seeded users: ${remaining.length}`);
}

async function seedUsers(db: ReturnType<typeof drizzle>, count: number) {
  const payload = Array.from({ length: count }, (_, i) => buildUser(i));
  await db.insert(users).values(payload).onConflictDoNothing({ target: users.clerkId });
  const seeded = await db
    .select({ id: users.id, clerkId: users.clerkId })
    .from(users)
    .where(like(users.clerkId, `${DEV_PREFIX}%`));
  console.log(
    `Seed complete. Requested ${count}; total seeded users present: ${seeded.length}.`,
  );
}

async function main() {
  const databaseUrl = assertSafeToRun();
  neonConfig.webSocketConstructor = ws;
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);
  const shouldClear = process.argv.includes("--clear");
  const count = parseCount();

  try {
    if (shouldClear) {
      await clearSeedUsers(db);
    } else {
      await seedUsers(db, count);
      console.log("Tip: run `npm run seed:dev-users:clear` to remove them later.");
    }
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
