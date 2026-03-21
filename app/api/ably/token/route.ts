import type { capabilityOp } from "ably";
import Ably from "ably";
import { NextResponse } from "next/server";
import { requireDbUser } from "@/lib/auth";

/** Chat + pub/sub ops Ably Chat needs for rooms under our app. */
const CHAT_CAPABILITY: { [key: string]: capabilityOp[] | ["*"] } = {
  "*": [
    "publish",
    "subscribe",
    "history",
    "presence",
    "channel-metadata",
    "annotation-publish",
    "annotation-subscribe",
  ],
};

/**
 * Mint a short-lived Ably token for the signed-in user (clientId = DB user id).
 * Mobile uses this with Ably Chat; keep ABLY_API_KEY only on the server.
 */
export async function POST(req: Request) {
  try {
    const user = await requireDbUser(req);
    const key = process.env.ABLY_API_KEY?.trim();
    if (!key) {
      return NextResponse.json(
        { error: "Ably is not configured on this server." },
        { status: 503 },
      );
    }

    const rest = new Ably.Rest(key);
    const tokenRequest = await rest.auth.createTokenRequest({
      clientId: user.id,
      capability: CHAT_CAPABILITY,
      ttl: 60 * 60 * 1000,
    });

    return NextResponse.json(tokenRequest);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST /api/ably/token]", error);
    return NextResponse.json({ error: "Unable to issue Ably token." }, { status: 500 });
  }
}
