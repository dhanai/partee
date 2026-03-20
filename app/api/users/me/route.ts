import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().max(255).nullable().optional(),
  avatar: z
    .string()
    .trim()
    .max(2048)
    .refine(
      (value) =>
        value.length === 0 || value.startsWith("/") || /^https?:\/\/.+/i.test(value),
      {
        message: "avatar must be a valid URL or app-relative path.",
      },
    )
    .nullable()
    .optional(),
  handicap: z
    .string()
    .trim()
    .max(8)
    .regex(/^\d{1,2}(\.\d{1,2})?$/, "Handicap must be a number like 8.4")
    .nullable()
    .optional(),
  homeCourse: z.string().trim().max(120).nullable().optional(),
});

export async function GET(req: Request) {
  try {
    const user = await requireDbUser(req);
    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        handicap: user.handicap,
        homeCourse: user.homeCourse,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to load profile." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireDbUser(req);
    const parsed = updateSchema.parse(await req.json());

    const updates: Partial<{
      name: string;
      email: string | null;
      avatar: string | null;
      handicap: string | null;
      homeCourse: string | null;
    }> = {};

    if (parsed.name !== undefined) updates.name = parsed.name;
    if (parsed.email !== undefined) updates.email = parsed.email;
    if (parsed.avatar !== undefined) updates.avatar = parsed.avatar?.trim() || null;
    if (parsed.handicap !== undefined) updates.handicap = parsed.handicap?.trim() || null;
    if (parsed.homeCourse !== undefined) {
      updates.homeCourse = parsed.homeCourse?.trim() || null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No profile changes submitted." }, { status: 400 });
    }

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, user.id))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        avatar: users.avatar,
        handicap: users.handicap,
        homeCourse: users.homeCourse,
      });

    return NextResponse.json({ user: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid profile payload.", issues: error.flatten() },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to update profile." }, { status: 500 });
  }
}
