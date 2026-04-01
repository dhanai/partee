import "dotenv/config";
import { config as dotenvConfig } from "dotenv";
import { Pool } from "@neondatabase/serverless";

dotenvConfig({ path: ".env.local", override: true });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const pool = new Pool({ connectionString: databaseUrl });

async function explain(label: string, query: string) {
  const client = await pool.connect();
  const result = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${query}`);
  client.release();
  console.log(`\n=== ${label} ===`);
  for (const row of result.rows) {
    const line = (row as Record<string, unknown>)["QUERY PLAN"];
    if (typeof line === "string") console.log(line);
  }
}

async function main() {
  const profileUserId = process.argv[2];
  const viewerUserId = process.argv[3];
  const groupId = process.argv[4];

  if (!profileUserId || !viewerUserId || !groupId) {
    console.log(
      "Usage: tsx db/profile-activity-baseline.ts <profileUserId> <viewerUserId> <groupId>",
    );
    process.exit(1);
  }

  await explain(
    "Profile posts feed",
    `
    SELECT p.id, p.created_at
    FROM posts p
    WHERE p.scope = 'profile'
      AND p.hidden_on_profile = false
      AND p.profile_user_id = '${profileUserId}'
    ORDER BY p.created_at DESC
    LIMIT 20
  `,
  );

  await explain(
    "Profile hosted open rounds",
    `
    SELECT r.id, r.created_at
    FROM rounds r
    WHERE r.host_id = '${profileUserId}'
      AND r.status IN ('forming', 'confirmed')
      AND coalesce(r.tee_time, r.target_date) > now()
    ORDER BY r.created_at DESC
    LIMIT 40
  `,
  );

  await explain(
    "Group activity rounds",
    `
    SELECT r.id, r.created_at
    FROM rounds r
    WHERE r.group_id = '${groupId}'
    ORDER BY r.created_at DESC
    LIMIT 20
  `,
  );

  await explain(
    "Group members timeline",
    `
    SELECT gm.id, gm.joined_at
    FROM group_members gm
    WHERE gm.group_id = '${groupId}'
    ORDER BY gm.joined_at DESC
    LIMIT 20
  `,
  );

  await explain(
    "Notifications actor cleanup",
    `
    SELECT n.id
    FROM in_app_notifications n
    WHERE n.type = 'post_liked'
      AND n.data->>'actorUserId' = '${viewerUserId}'
    LIMIT 50
  `,
  );

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  void pool.end();
  process.exit(1);
});
