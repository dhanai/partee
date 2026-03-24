import { eq } from "drizzle-orm";
import { db } from "@/db";
import { siteMetaConfig } from "@/db/schema";

export const SITE_META_ROW_ID = "global";

export type SiteMetaDto = {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  ogImageUrl: string | null;
  twitterTitle: string;
  twitterDescription: string;
  twitterImageUrl: string | null;
};

export function defaultSiteMeta(): SiteMetaDto {
  const title = "Parfade — Golf plans without the group text chaos";
  const description =
    "Organize rounds, find players, and run side games. Download Parfade for iOS or get started on the web.";
  return {
    title,
    description,
    ogTitle: title,
    ogDescription: description,
    ogImageUrl: null,
    twitterTitle: title,
    twitterDescription: description,
    twitterImageUrl: null,
  };
}

function trimOrNull(v: string | null | undefined): string | null {
  const t = v?.trim() ?? "";
  return t.length > 0 ? t : null;
}

export async function loadSiteMetaForApi(): Promise<SiteMetaDto> {
  const [row] = await db
    .select()
    .from(siteMetaConfig)
    .where(eq(siteMetaConfig.id, SITE_META_ROW_ID))
    .limit(1);

  if (!row) return defaultSiteMeta();

  const base = defaultSiteMeta();
  return {
    title: row.title?.trim() || base.title,
    description: row.description?.trim() || base.description,
    ogTitle: row.ogTitle?.trim() || row.title?.trim() || base.ogTitle,
    ogDescription: row.ogDescription?.trim() || row.description?.trim() || base.ogDescription,
    ogImageUrl: trimOrNull(row.ogImageUrl),
    twitterTitle: row.twitterTitle?.trim() || row.ogTitle?.trim() || row.title?.trim() || base.twitterTitle,
    twitterDescription:
      row.twitterDescription?.trim() ||
      row.ogDescription?.trim() ||
      row.description?.trim() ||
      base.twitterDescription,
    twitterImageUrl: trimOrNull(row.twitterImageUrl) ?? trimOrNull(row.ogImageUrl),
  };
}

export async function saveSiteMeta(next: SiteMetaDto): Promise<void> {
  await db
    .insert(siteMetaConfig)
    .values({
      id: SITE_META_ROW_ID,
      title: next.title.trim(),
      description: next.description.trim(),
      ogTitle: next.ogTitle.trim(),
      ogDescription: next.ogDescription.trim(),
      ogImageUrl: trimOrNull(next.ogImageUrl),
      twitterTitle: next.twitterTitle.trim(),
      twitterDescription: next.twitterDescription.trim(),
      twitterImageUrl: trimOrNull(next.twitterImageUrl),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: siteMetaConfig.id,
      set: {
        title: next.title.trim(),
        description: next.description.trim(),
        ogTitle: next.ogTitle.trim(),
        ogDescription: next.ogDescription.trim(),
        ogImageUrl: trimOrNull(next.ogImageUrl),
        twitterTitle: next.twitterTitle.trim(),
        twitterDescription: next.twitterDescription.trim(),
        twitterImageUrl: trimOrNull(next.twitterImageUrl),
        updatedAt: new Date(),
      },
    });
}
