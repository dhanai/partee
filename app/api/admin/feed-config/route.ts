import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { pageContentConfig } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import {
  getDiscoverFeedConfig,
  invalidateDiscoverFeedConfigCache,
  type DiscoverFeedConfig,
} from "@/lib/discover-feed-config";
import { isUserAdmin } from "@/lib/require-admin";

const patchSchema = z.object({
  sortMode: z.enum(["chronological", "scored"]),
});

const CONFIG_KEY = "app:discover-feed";

function forbidden(msg: string) {
  return NextResponse.json({ error: msg }, { status: 403 });
}

export async function GET(req: Request) {
  try {
    const user = await requireDbUser(req);
    if (!isUserAdmin(user)) return forbidden("Not authorized.");
    return NextResponse.json(await getDiscoverFeedConfig());
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[GET /api/admin/feed-config]", error);
    return NextResponse.json({ error: "Unable to load." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireDbUser(req);
    if (!isUserAdmin(user)) return forbidden("Not authorized.");

    const patch = patchSchema.parse(await req.json());
    const current = await getDiscoverFeedConfig();
    const next: DiscoverFeedConfig = { ...current, ...patch };

    await db
      .insert(pageContentConfig)
      .values({
        pageKey: CONFIG_KEY,
        content: next as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: pageContentConfig.pageKey,
        set: {
          content: next as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        },
      });

    invalidateDiscoverFeedConfigCache();
    return NextResponse.json(next);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid body.", issues: error.flatten() }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[PATCH /api/admin/feed-config]", error);
    return NextResponse.json({ error: "Unable to save." }, { status: 500 });
  }
}
