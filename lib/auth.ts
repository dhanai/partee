import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

export async function getCurrentClerkId(): Promise<string | null> {
  const { userId } = auth();
  return userId ?? null;
}

export async function getDbUserByClerkId(clerkId: string) {
  const [user] = await db.select().from(users).where(eq(users.clerkId, clerkId));
  return user ?? null;
}

export async function ensureDbUser() {
  const clerkId = await getCurrentClerkId();
  if (!clerkId) {
    return null;
  }

  const existing = await getDbUserByClerkId(clerkId);
  if (existing) {
    return existing;
  }

  const clerkUser = await currentUser();
  if (!clerkUser) {
    return null;
  }

  const primaryEmail = clerkUser.emailAddresses[0]?.emailAddress;
  const derivedName =
    clerkUser.fullName ??
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ??
    primaryEmail ??
    "Partee golfer";

  const [created] = await db
    .insert(users)
    .values({
      clerkId,
      email: primaryEmail ?? null,
      name: derivedName,
      avatar: clerkUser.imageUrl ?? null,
    })
    .returning();

  return created ?? null;
}

export async function requireDbUser() {
  const user = await ensureDbUser();
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
