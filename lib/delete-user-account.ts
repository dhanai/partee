import { and, asc, eq, ne, sql } from "drizzle-orm";
import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/db";
import { groupMembers, groups, inAppNotifications, users } from "@/db/schema";

/**
 * Orchestrates full account deletion:
 * 1. Transfers group ownership for any groups the user owns
 * 2. Deletes the users row (CASCADE handles rounds, spots, follows, etc.)
 * 3. Messages survive with userId = NULL (SET NULL FK)
 * 4. Best-effort deletes the Clerk user
 */
export async function deleteUserAccount(userId: string, clerkId: string) {
  await transferGroupOwnership(userId);
  await db
    .delete(inAppNotifications)
    .where(sql`${inAppNotifications.data}->>'actorUserId' = ${userId}`);
  await db.delete(users).where(eq(users.id, userId));

  try {
    await clerkClient.users.deleteUser(clerkId);
  } catch {
    // Clerk user may already be deleted or unreachable.
  }
}

async function transferGroupOwnership(userId: string) {
  const ownedGroups = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(and(eq(groupMembers.userId, userId), eq(groupMembers.role, "owner")));

  for (const { groupId } of ownedGroups) {
    const otherMembers = await db
      .select({ userId: groupMembers.userId, role: groupMembers.role })
      .from(groupMembers)
      .where(
        and(eq(groupMembers.groupId, groupId), ne(groupMembers.userId, userId)),
      )
      .orderBy(asc(groupMembers.joinedAt));

    if (otherMembers.length === 0) {
      await db.delete(groups).where(eq(groups.id, groupId));
      continue;
    }

    const successor =
      otherMembers.find((m) => m.role === "admin") ?? otherMembers[0]!;

    await db
      .update(groupMembers)
      .set({ role: "owner" })
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, successor.userId),
        ),
      );

    await db
      .update(groups)
      .set({ createdBy: successor.userId })
      .where(eq(groups.id, groupId));
  }
}
