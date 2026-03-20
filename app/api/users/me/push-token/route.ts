import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { isExpoPushToken } from "@/lib/expo-push-token";

export const runtime = "nodejs";

const bodySchema = z.object({
  expoPushToken: z.string().trim().min(10).max(512).nullable(),
});

export async function POST(req: Request) {
  try {
    const viewer = await requireDbUser(req);
    const parsed = bodySchema.parse(await req.json());

    const next = parsed.expoPushToken;
    if (next != null && !isExpoPushToken(next)) {
      return NextResponse.json({ error: "Invalid Expo push token." }, { status: 400 });
    }

    await db
      .update(users)
      .set({ expoPushToken: next })
      .where(eq(users.id, viewer.id));

    return NextResponse.json({ ok: true as const });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid push token payload.", issues: error.flatten() },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to save push token." }, { status: 500 });
  }
}
