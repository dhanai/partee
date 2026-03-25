import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { clerkClient } from "@clerk/nextjs/server";
import { z } from "zod";
import { db } from "@/db";
import { userFollows, users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { publishAfterProfileUpdated } from "@/lib/parfade-ably-publish";
import { resolveValidatedUsLocationLabel } from "@/lib/places";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  /** Ignored: email is managed by Clerk (UserProfile / webhooks), not this route. */
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
  location: z.string().trim().max(120).nullable().optional(),
  homeCourse: z.string().trim().max(120).nullable().optional(),
  followVisibility: z.enum(["public", "private"]).optional(),
  hideHostedRoundsFromDiscover: z.boolean().optional(),
});

export async function GET(req: Request) {
  try {
    const user = await requireDbUser(req);
    const [followerCountRows, followingCountRows] = await Promise.all([
      db
        .select({
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(userFollows)
        .where(
          and(eq(userFollows.followedId, user.id), eq(userFollows.status, "accepted")),
        ),
      db
        .select({
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(userFollows)
        .where(
          and(eq(userFollows.followerId, user.id), eq(userFollows.status, "accepted")),
        ),
    ]);

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        isAdmin: user.isAdmin,
        handicap: user.handicap,
        location: user.homeCourse,
        homeCourse: user.homeCourse,
        followVisibility: user.followVisibility,
        hideHostedRoundsFromDiscover: user.hideHostedRoundsFromDiscover,
        followersCount: followerCountRows[0]?.count ?? 0,
        followingCount: followingCountRows[0]?.count ?? 0,
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
      avatar: string | null;
      handicap: string | null;
      homeCourse: string | null;
      followVisibility: "public" | "private";
      hideHostedRoundsFromDiscover: boolean;
    }> = {};

    if (parsed.name !== undefined) updates.name = parsed.name;
    if (parsed.avatar !== undefined) updates.avatar = parsed.avatar?.trim() || null;
    if (parsed.handicap !== undefined) updates.handicap = parsed.handicap?.trim() || null;
    if (parsed.location !== undefined) {
      const nextLocation = parsed.location?.trim() || null;
      if (nextLocation) {
        const canonical = await resolveValidatedUsLocationLabel(nextLocation);
        if (!canonical) {
          return NextResponse.json(
            {
              error:
                "Location must be a valid US City, ST selected from suggestions.",
            },
            { status: 400 },
          );
        }
        updates.homeCourse = canonical;
      } else {
        updates.homeCourse = null;
      }
    }
    if (parsed.homeCourse !== undefined && parsed.location === undefined) {
      const legacyLocation = parsed.homeCourse?.trim() || null;
      if (legacyLocation) {
        const canonical = await resolveValidatedUsLocationLabel(legacyLocation);
        if (!canonical) {
          return NextResponse.json(
            {
              error:
                "Location must be a valid US City, ST selected from suggestions.",
            },
            { status: 400 },
          );
        }
        updates.homeCourse = canonical;
      } else {
        updates.homeCourse = null;
      }
    }
    if (parsed.followVisibility !== undefined) {
      updates.followVisibility = parsed.followVisibility;
    }
    if (parsed.hideHostedRoundsFromDiscover !== undefined) {
      updates.hideHostedRoundsFromDiscover = parsed.hideHostedRoundsFromDiscover;
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
        location: users.homeCourse,
        homeCourse: users.homeCourse,
        followVisibility: users.followVisibility,
        hideHostedRoundsFromDiscover: users.hideHostedRoundsFromDiscover,
      });

    publishAfterProfileUpdated(user.id);

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

export async function DELETE(req: Request) {
  try {
    const user = await requireDbUser(req);
    const clerkId = user.clerkId;

    await db.delete(users).where(eq(users.id, user.id));

    try {
      await clerkClient.users.deleteUser(clerkId);
    } catch {
      // Best-effort: Clerk user may already be deleted or unreachable.
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to delete account." }, { status: 500 });
  }
}
