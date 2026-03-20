import { auth, clerkClient, currentUser, verifyToken } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

export async function getCurrentClerkId(req?: Request): Promise<string | null> {
  if (req) {
    const authHeader = req.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;

    if (bearerToken) {
      try {
        const payload = await verifyToken(bearerToken, {
          secretKey: process.env.CLERK_SECRET_KEY,
        });
        if (payload.sub) {
          return payload.sub;
        }
      } catch {
        // Fall through to cookie/session auth.
      }
    }
  }

  const { userId } = auth();
  return userId ?? null;
}

export async function getDbUserByClerkId(clerkId: string) {
  const [user] = await db.select().from(users).where(eq(users.clerkId, clerkId));
  return user ?? null;
}

export async function ensureDbUser(req?: Request) {
  const clerkId = await getCurrentClerkId(req);
  if (!clerkId) {
    return null;
  }

  const existing = await getDbUserByClerkId(clerkId);
  if (existing) {
    return existing;
  }

  // Cookie/session (web): currentUser(). Bearer-only clients (Expo): no session — use Backend API.
  const sessionUser = await currentUser();
  let primaryEmail: string | null = null;
  let derivedName: string;
  let avatar: string | null = null;

  if (sessionUser) {
    primaryEmail = sessionUser.emailAddresses[0]?.emailAddress ?? null;
    derivedName =
      sessionUser.fullName ??
      [sessionUser.firstName, sessionUser.lastName].filter(Boolean).join(" ") ??
      primaryEmail ??
      "Partee golfer";
    avatar = sessionUser.imageUrl ?? null;
  } else {
    try {
      const u = await clerkClient.users.getUser(clerkId);
      primaryEmail = u.emailAddresses[0]?.emailAddress ?? null;
      derivedName =
        u.fullName ??
        [u.firstName, u.lastName].filter(Boolean).join(" ") ??
        primaryEmail ??
        "Partee golfer";
      avatar = u.imageUrl ?? null;
    } catch {
      return null;
    }
  }

  const [created] = await db
    .insert(users)
    .values({
      clerkId,
      email: primaryEmail ?? null,
      name: derivedName,
      avatar,
    })
    .returning();

  return created ?? null;
}

export async function requireDbUser(req?: Request) {
  const user = await ensureDbUser(req);
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function updateUserProfile(input: {
  clerkId: string;
  email?: string | null;
  name: string;
  avatar?: string | null;
  handicap?: string | null;
  homeCourse?: string | null;
}) {
  const [updated] = await db
    .insert(users)
    .values({
      clerkId: input.clerkId,
      email: input.email ?? null,
      name: input.name,
      avatar: input.avatar ?? null,
      handicap: input.handicap ?? null,
      homeCourse: input.homeCourse ?? null,
    })
    .onConflictDoUpdate({
      target: users.clerkId,
      set: {
        email: input.email ?? null,
        name: input.name,
        avatar: input.avatar ?? null,
        handicap: input.handicap ?? null,
        homeCourse: input.homeCourse ?? null,
      },
    })
    .returning();

  return updated;
}
