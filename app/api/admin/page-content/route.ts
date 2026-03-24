import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDbUser } from "@/lib/auth";
import {
  defaultHomePageContent,
  defaultPrivacyPageContent,
  defaultSupportPageContent,
  loadPageContent,
  sanitizeHomePageContent,
  sanitizePrivacyPageContent,
  sanitizeSupportPageContent,
  savePageContent,
  type PageContentKey,
} from "@/lib/page-content";
import { isUserAdmin } from "@/lib/require-admin";

const pageKeyZ = z.enum(["home", "support", "privacy"]);

const homeBodyZ = z.object({
  heroEyebrow: z.string().trim().max(120),
  heroTitle: z.string().trim().max(160),
  heroDescription: z.string().trim().max(500),
  ctaWebLabel: z.string().trim().max(50),
  ctaAppLabel: z.string().trim().max(80),
});

const supportBodyZ = z.object({
  title: z.string().trim().max(120),
  intro: z.string().trim().max(500),
  contactHeading: z.string().trim().max(120),
  contactBlurb: z.string().trim().max(500),
});

const privacyBodyZ = z.object({
  title: z.string().trim().max(120),
  intro: z.string().trim().max(600),
  effectiveDate: z.string().trim().max(80),
});

function forbidden(msg: string) {
  return NextResponse.json({ error: msg }, { status: 403 });
}

async function loadFor(page: PageContentKey) {
  if (page === "home") {
    const defaults = defaultHomePageContent();
    return loadPageContent(page, defaults, sanitizeHomePageContent);
  }
  if (page === "support") {
    const defaults = defaultSupportPageContent();
    return loadPageContent(page, defaults, sanitizeSupportPageContent);
  }
  const defaults = defaultPrivacyPageContent();
  return loadPageContent(page, defaults, sanitizePrivacyPageContent);
}

export async function GET(req: Request) {
  try {
    const user = await requireDbUser(req);
    if (!isUserAdmin(user)) return forbidden("Not authorized.");
    const { searchParams } = new URL(req.url);
    const page = pageKeyZ.parse(searchParams.get("page"));
    const content = await loadFor(page);
    return NextResponse.json({ page, content });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid page key." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[GET /api/admin/page-content]", error);
    return NextResponse.json({ error: "Unable to load content." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireDbUser(req);
    if (!isUserAdmin(user)) return forbidden("Not authorized.");
    const { searchParams } = new URL(req.url);
    const page = pageKeyZ.parse(searchParams.get("page"));
    const payload = await req.json();

    let content: Record<string, unknown>;
    if (page === "home") content = homeBodyZ.parse(payload);
    else if (page === "support") content = supportBodyZ.parse(payload);
    else content = privacyBodyZ.parse(payload);

    await savePageContent(page, content);
    return NextResponse.json({ page, content: await loadFor(page) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid body.", issues: error.flatten() },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[PATCH /api/admin/page-content]", error);
    return NextResponse.json({ error: "Unable to save content." }, { status: 500 });
  }
}
