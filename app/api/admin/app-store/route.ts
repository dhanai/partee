import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { pageContentConfig } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import {
  getAppStoreConfig,
  invalidateAppStoreConfigCache,
  type AppStoreConfig,
} from "@/lib/app-store-config";
import { isUserAdmin } from "@/lib/require-admin";

const patchSchema = z.object({
  iosAppId: z.string().nullable(),
});

const CONFIG_KEY = "app:app-store";

export async function GET(req: Request) {
  try {
    const user = await requireDbUser(req);
    if (!isUserAdmin(user)) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    return NextResponse.json(await getAppStoreConfig());
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[GET /api/admin/app-store]", error);
    return NextResponse.json({ error: "Unable to load." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireDbUser(req);
    if (!isUserAdmin(user)) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

    const patch = patchSchema.parse(await req.json());
    const current = await getAppStoreConfig();
    const next: AppStoreConfig = {
      ...current,
      iosAppId: patch.iosAppId?.trim() || null,
    };

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

    invalidateAppStoreConfigCache();
    return NextResponse.json(next);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid body.", issues: error.flatten() }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[PATCH /api/admin/app-store]", error);
    return NextResponse.json({ error: "Unable to save." }, { status: 500 });
  }
}
