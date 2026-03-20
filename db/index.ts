import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";
import { env } from "@/lib/env";

neonConfig.webSocketConstructor = ws;
/** HTTP fetch queries avoid WebSocket + Next dev webpack chunk issues (intermittent HTML 500s on API routes). */
neonConfig.poolQueryViaFetch = true;

const pool = new Pool({ connectionString: env.server.DATABASE_URL });

export const db = drizzle(pool, { schema });
