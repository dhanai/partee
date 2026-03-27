import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pageContentConfig } from "@/db/schema";

const CONFIG_KEY = "app:app-store";

export type AppStoreConfig = {
  iosAppId: string | null;
};

let cached: { config: AppStoreConfig; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

export async function getAppStoreConfig(): Promise<AppStoreConfig> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.config;

  const [row] = await db
    .select({ content: pageContentConfig.content })
    .from(pageContentConfig)
    .where(eq(pageContentConfig.pageKey, CONFIG_KEY))
    .limit(1);

  const c = (row?.content ?? {}) as Partial<AppStoreConfig>;
  const config: AppStoreConfig = {
    iosAppId: typeof c.iosAppId === "string" && c.iosAppId.trim() ? c.iosAppId.trim() : null,
  };

  cached = { config, expiresAt: now + CACHE_TTL_MS };
  return config;
}

export function invalidateAppStoreConfigCache() {
  cached = null;
}

export function buildAppStoreUrl(appId: string): string {
  return `https://apps.apple.com/app/id${appId}`;
}
