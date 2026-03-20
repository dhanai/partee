import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";
import { env } from "@/lib/env";

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: env.server.DATABASE_URL });

export const db = drizzle(pool, { schema });
