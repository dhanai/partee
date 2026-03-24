import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { isUserAdmin } from "@/lib/require-admin";

const patchBodyZ = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  followVisibility: z.enum(["public", "private"]).optional(),
  hideHostedRoundsFromDiscover: z.boolean().optional(),
  isAdmin: z.boolean().optional(),
  clearPushToken: z.boolean().optional(),
});

function forbidden(msg: string) {
  return NextResponse.json({ error: msg }, { status: 403 });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const currentUser = await requireDbUser(req);
    if (!isUserAdmin(currentUser)) return forbidden("Not authorized.");

    const body = patchBodyZ.parse(await req.json());
    const patch: {
      name?: string;
      followVisibility?: "public" | "private";
      hideHostedRoundsFromDiscover?: boolean;
      isAdmin?: boolean;
      expoPushToken?: string | null;
    } = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.followVisibility !== undefined) patch.followVisibility = body.followVisibility;
    if (body.hideHostedRoundsFromDiscover !== undefined) {
      patch.hideHostedRoundsFromDiscover = body.hideHostedRoundsFromDiscover;
    }
    if (body.isAdmin !== undefined) patch.isAdmin = body.isAdmin;
    if (body.clearPushToken) patch.expoPushToken = null;

    if (params.id === currentUser.id && body.isAdmin === false) {
      return NextResponse.json({ error: "You cannot remove your own admin access." }, { status: 400 });
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No changes provided." }, { status: 400 });
    }

    const updated = await db
      .update(users)
      .set(patch)
      .where(eq(users.id, params.id))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        followVisibility: users.followVisibility,
        hideHostedRoundsFromDiscover: users.hideHostedRoundsFromDiscover,
        isAdmin: users.isAdmin,
      });

    if (updated.length === 0) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    return NextResponse.json({ user: updated[0] });
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
    console.error("[PATCH /api/admin/users/[id]]", error);
    return NextResponse.json({ error: "Unable to save." }, { status: 500 });
  }
}
