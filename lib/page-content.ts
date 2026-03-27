import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pageContentConfig } from "@/db/schema";

export type PageContentKey = "home" | "support" | "privacy";

export type HomePageContent = {
  heroEyebrow: string;
  heroTitle: string;
  heroDescription: string;
  ctaAppLabel: string;
};

export type SupportPageContent = {
  title: string;
  intro: string;
  contactHeading: string;
  contactBlurb: string;
};

export type PrivacyPageContent = {
  title: string;
  intro: string;
  effectiveDate: string;
};

export function defaultHomePageContent(): HomePageContent {
  return {
    heroEyebrow: "Organize golf with your crew",
    heroTitle: "Golf plans without the group text chaos.",
    heroDescription:
      "Parfade is for inviting friends, filling open spots, and keeping rounds and side games in one calm place—all from the iOS app.",
    ctaAppLabel: "Download on the App Store",
  };
}

export function defaultSupportPageContent(): SupportPageContent {
  return {
    title: "Support",
    intro: "We're here to help with Parfade on iOS and the web.",
    contactHeading: "Contact us",
    contactBlurb:
      "For account issues, bugs, or general questions, email us and we'll get back as soon as we can.",
  };
}

export function defaultPrivacyPageContent(): PrivacyPageContent {
  return {
    title: "Privacy Policy",
    intro:
      "This Privacy Policy explains how Parfade collects, uses, and shares information when you use our iOS app and web app.",
    effectiveDate: "March 24, 2026",
  };
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function loadPageContent<T>(
  pageKey: PageContentKey,
  defaults: T,
  sanitize: (row: Record<string, unknown>, defaults: T) => T,
): Promise<T> {
  const [row] = await db
    .select()
    .from(pageContentConfig)
    .where(eq(pageContentConfig.pageKey, pageKey))
    .limit(1);
  if (!row) return defaults;
  return sanitize(asRecord(row.content), defaults);
}

export async function savePageContent(pageKey: PageContentKey, content: Record<string, unknown>): Promise<void> {
  await db
    .insert(pageContentConfig)
    .values({
      pageKey,
      content,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: pageContentConfig.pageKey,
      set: {
        content,
        updatedAt: new Date(),
      },
    });
}

export function sanitizeHomePageContent(row: Record<string, unknown>, defaults: HomePageContent): HomePageContent {
  return {
    heroEyebrow: asString(row.heroEyebrow) || defaults.heroEyebrow,
    heroTitle: asString(row.heroTitle) || defaults.heroTitle,
    heroDescription: asString(row.heroDescription) || defaults.heroDescription,
    ctaAppLabel: asString(row.ctaAppLabel) || defaults.ctaAppLabel,
  };
}

export function sanitizeSupportPageContent(
  row: Record<string, unknown>,
  defaults: SupportPageContent,
): SupportPageContent {
  return {
    title: asString(row.title) || defaults.title,
    intro: asString(row.intro) || defaults.intro,
    contactHeading: asString(row.contactHeading) || defaults.contactHeading,
    contactBlurb: asString(row.contactBlurb) || defaults.contactBlurb,
  };
}

export function sanitizePrivacyPageContent(
  row: Record<string, unknown>,
  defaults: PrivacyPageContent,
): PrivacyPageContent {
  return {
    title: asString(row.title) || defaults.title,
    intro: asString(row.intro) || defaults.intro,
    effectiveDate: asString(row.effectiveDate) || defaults.effectiveDate,
  };
}

export async function loadHomePageContent(): Promise<HomePageContent> {
  const defaults = defaultHomePageContent();
  return loadPageContent("home", defaults, sanitizeHomePageContent);
}

export async function loadSupportPageContent(): Promise<SupportPageContent> {
  const defaults = defaultSupportPageContent();
  return loadPageContent("support", defaults, sanitizeSupportPageContent);
}

export async function loadPrivacyPageContent(): Promise<PrivacyPageContent> {
  const defaults = defaultPrivacyPageContent();
  return loadPageContent("privacy", defaults, sanitizePrivacyPageContent);
}
