/**
 * Idempotent migration: copies round_messages, round_message_reactions, and
 * chat_read_receipts into the unified conversations / messages / message_reactions /
 * conversation_read_receipts tables.
 *
 * Safe to run multiple times — uses INSERT ... ON CONFLICT DO NOTHING throughout.
 *
 * Usage:  npx tsx db/migrate-round-chat-to-conversations.ts
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

export async function migrateRoundChatToConversations(): Promise<void> {
  console.log("Step 1: Creating conversations for rounds that don't have one...");
  const convResult = await sql`
    INSERT INTO conversations (id, type, round_id, created_at)
    SELECT gen_random_uuid(), 'round', r.id, r.created_at
    FROM rounds r
    WHERE NOT EXISTS (
      SELECT 1 FROM conversations c WHERE c.round_id = r.id AND c.type = 'round'
    )
  `;
  console.log(`  Created ${convResult.count ?? 0} conversation(s).`);

  console.log("Step 2: Adding conversation participants (host + confirmed spots)...");
  const hostResult = await sql`
    INSERT INTO conversation_participants (id, conversation_id, user_id, created_at)
    SELECT gen_random_uuid(), c.id, r.host_id, r.created_at
    FROM conversations c
    INNER JOIN rounds r ON r.id = c.round_id
    WHERE c.type = 'round'
    ON CONFLICT (conversation_id, user_id) DO NOTHING
  `;
  console.log(`  Added ${hostResult.count ?? 0} host participant(s).`);

  const spotResult = await sql`
    INSERT INTO conversation_participants (id, conversation_id, user_id, created_at)
    SELECT gen_random_uuid(), c.id, s.user_id, s.created_at
    FROM conversations c
    INNER JOIN spots s ON s.round_id = c.round_id
    WHERE c.type = 'round' AND s.status = 'confirmed'
    ON CONFLICT (conversation_id, user_id) DO NOTHING
  `;
  console.log(`  Added ${spotResult.count ?? 0} confirmed-spot participant(s).`);

  console.log("Step 3: Copying round_messages → messages (preserving UUIDs)...");
  const msgResult = await sql`
    INSERT INTO messages (id, conversation_id, user_id, body, parent_id, created_at)
    SELECT rm.id, c.id, rm.user_id, rm.body, rm.parent_id, rm.created_at
    FROM round_messages rm
    INNER JOIN conversations c ON c.round_id = rm.round_id AND c.type = 'round'
    ON CONFLICT (id) DO NOTHING
  `;
  console.log(`  Copied ${msgResult.count ?? 0} message(s).`);

  console.log("Step 4: Copying round_message_reactions → message_reactions...");
  const rxnResult = await sql`
    INSERT INTO message_reactions (id, message_id, user_id, emoji, created_at)
    SELECT rmr.id, rmr.message_id, rmr.user_id, rmr.emoji, rmr.created_at
    FROM round_message_reactions rmr
    WHERE EXISTS (SELECT 1 FROM messages m WHERE m.id = rmr.message_id)
    ON CONFLICT (message_id, user_id, emoji) DO NOTHING
  `;
  console.log(`  Copied ${rxnResult.count ?? 0} reaction(s).`);

  console.log("Step 5: Copying chat_read_receipts → conversation_read_receipts...");
  const receiptResult = await sql`
    INSERT INTO conversation_read_receipts (id, user_id, conversation_id, last_read_at)
    SELECT gen_random_uuid(), crr.user_id, c.id, crr.last_read_at
    FROM chat_read_receipts crr
    INNER JOIN conversations c ON c.round_id = crr.round_id AND c.type = 'round'
    ON CONFLICT (user_id, conversation_id) DO NOTHING
  `;
  console.log(`  Copied ${receiptResult.count ?? 0} read receipt(s).`);

  console.log("Migration complete.");
}

const invokedAsThisScript =
  process.argv[1] != null &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedAsThisScript) {
  migrateRoundChatToConversations().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
