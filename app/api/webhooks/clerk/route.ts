import { headers } from "next/headers";
import { Webhook } from "svix";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getDbUserByClerkId, updateUserProfile } from "@/lib/auth";
import { deleteUserAccount } from "@/lib/delete-user-account";

type ClerkWebhookPayload = {
  type: string;
  data?: {
    id?: string;
    image_url?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    email_addresses?: Array<{ email_address: string }>;
  };
};

export async function POST(req: Request) {
  if (!env.server.CLERK_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Webhook secret not configured." }, { status: 503 });
  }

  const headerStore = headers();
  const svixId = headerStore.get("svix-id");
  const svixTimestamp = headerStore.get("svix-timestamp");
  const svixSignature = headerStore.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: "Missing svix headers" },
      { status: 400 },
    );
  }

  const payload = await req.text();
  const wh = new Webhook(env.server.CLERK_WEBHOOK_SECRET);

  let event: ClerkWebhookPayload;
  try {
    event = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  if (event.type === "user.created" && event.data?.id) {
    const name =
      [event.data.first_name, event.data.last_name].filter(Boolean).join(" ") ||
      event.data.email_addresses?.[0]?.email_address ||
      "Parfade golfer";

    await updateUserProfile({
      clerkId: event.data.id,
      email: event.data.email_addresses?.[0]?.email_address ?? null,
      name,
      avatar: event.data.image_url ?? null,
    });
  }

  if (event.type === "user.deleted" && event.data?.id) {
    const dbUser = await getDbUserByClerkId(event.data.id);
    if (dbUser) {
      await deleteUserAccount(dbUser.id, dbUser.clerkId);
    }
  }

  return NextResponse.json({ ok: true });
}
