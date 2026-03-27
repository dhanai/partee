import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pageContentConfig } from "@/db/schema";

const CONFIG_KEY = "app:discover-feed";

export type DiscoverFeedConfig = {
  sortMode: "chronological" | "scored";
};

const DEFAULTS: DiscoverFeedConfig = { sortMode: "chronological" };

let cached: { config: DiscoverFeedConfig; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

export async function getDiscoverFeedConfig(): Promise<DiscoverFeedConfig> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.config;

  const [row] = await db
    .select({ content: pageContentConfig.content })
    .from(pageContentConfig)
    .where(eq(pageContentConfig.pageKey, CONFIG_KEY))
    .limit(1);

  const c = (row?.content ?? {}) as Partial<DiscoverFeedConfig>;
  const config: DiscoverFeedConfig = {
    sortMode: c.sortMode === "scored" ? "scored" : "chronological",
  };

  cached = { config, expiresAt: now + CACHE_TTL_MS };
  return config;
}

export function invalidateDiscoverFeedConfigCache() {
  cached = null;
}
