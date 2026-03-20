import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { sendExpoPushMessages } from "@/lib/push-expo";

export async function notifyFollowRequest(input: {
  followedUserId: string;
  followerName: string;
}): Promise<void> {
  const [row] = await db
    .select({ token: users.expoPushToken })
    .from(users)
    .where(eq(users.id, input.followedUserId))
    .limit(1);

  const token = row?.token?.trim();
  if (!token) return;

  await sendExpoPushMessages([
    {
      to: token,
      sound: "default",
      title: "New follow request",
      body: `${input.followerName} wants to follow you on Partee.`,
      data: { type: "follow_request" },
    },
  ]);
}

export async function notifyRoundInvites(input: {
  inviteeUserIds: string[];
  body: string;
}): Promise<void> {
  if (input.inviteeUserIds.length === 0) return;

  const rows = await db
    .select({ token: users.expoPushToken })
    .from(users)
    .where(inArray(users.id, input.inviteeUserIds));

  const tokens = rows
    .map((r) => r.token?.trim())
    .filter((t): t is string => Boolean(t));

  if (tokens.length === 0) return;

  await sendExpoPushMessages(
    tokens.map((to) => ({
      to,
      sound: "default" as const,
      title: "Round invite",
      body: input.body,
      data: { type: "round_invite" },
    })),
  );
}
