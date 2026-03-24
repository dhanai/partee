import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDbUser } from "@/lib/auth";
import { loadSiteMetaForApi, saveSiteMeta } from "@/lib/site-meta";
import { isUserAdmin } from "@/lib/require-admin";

const nullableUrl = z
  .union([z.string().url(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v));

const patchBodyZ = z.object({
  title: z.string().trim().max(200).optional(),
  description: z.string().trim().max(500).optional(),
  ogTitle: z.string().trim().max(200).optional(),
  ogDescription: z.string().trim().max(500).optional(),
  ogImageUrl: nullableUrl,
  twitterTitle: z.string().trim().max(200).optional(),
  twitterDescription: z.string().trim().max(500).optional(),
  twitterImageUrl: nullableUrl,
});

function forbidden(msg: string) {
  return NextResponse.json({ error: msg }, { status: 403 });
}

export async function GET(req: Request) {
  try {
    const user = await requireDbUser(req);
    if (!isUserAdmin(user)) return forbidden("Not authorized.");
    const meta = await loadSiteMetaForApi();
    return NextResponse.json(meta);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[GET /api/admin/site-meta]", error);
    return NextResponse.json({ error: "Unable to load." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireDbUser(req);
    if (!isUserAdmin(user)) return forbidden("Not authorized.");

    const patch = patchBodyZ.parse(await req.json());
    const current = await loadSiteMetaForApi();
    const next = {
      title: patch.title ?? current.title,
      description: patch.description ?? current.description,
      ogTitle: patch.ogTitle ?? current.ogTitle,
      ogDescription: patch.ogDescription ?? current.ogDescription,
      ogImageUrl: patch.ogImageUrl ?? current.ogImageUrl,
      twitterTitle: patch.twitterTitle ?? current.twitterTitle,
      twitterDescription: patch.twitterDescription ?? current.twitterDescription,
      twitterImageUrl: patch.twitterImageUrl ?? current.twitterImageUrl,
    };
    await saveSiteMeta(next);
    return NextResponse.json(await loadSiteMetaForApi());
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
    console.error("[PATCH /api/admin/site-meta]", error);
    return NextResponse.json({ error: "Unable to save." }, { status: 500 });
  }
}
