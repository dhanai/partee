import type { capabilityOp } from "ably";
import Ably from "ably";
import { NextResponse } from "next/server";
import { requireDbUser } from "@/lib/auth";
import {
  parfadeDiscoverChannel,
  parfadeProfileChannelsCapabilityPattern,
  parfadeRoundDetailChannelsCapabilityPattern,
  parfadePostChannelsCapabilityPattern,
  parfadeGameSessionChannelsCapabilityPattern,
  parfadeGroupChannelsCapabilityPattern,
  parfadeUserInboxChannel,
} from "@/lib/parfade-ably-channels";

const CHAT_OPS: capabilityOp[] = [
  "publish",
  "subscribe",
  "history",
  "presence",
  "channel-metadata",
  "annotation-publish",
  "annotation-subscribe",
];

function clientCapability(userId: string): { [key: string]: capabilityOp[] } {
  return {
    "round:*": CHAT_OPS,
    "*::$chat": CHAT_OPS,
    [parfadeDiscoverChannel()]: ["subscribe"],
    [parfadeUserInboxChannel(userId)]: ["subscribe"],
    [parfadeProfileChannelsCapabilityPattern()]: ["subscribe"],
    [parfadeRoundDetailChannelsCapabilityPattern()]: ["subscribe"],
    [parfadePostChannelsCapabilityPattern()]: ["subscribe"],
    [parfadeGameSessionChannelsCapabilityPattern()]: ["subscribe"],
    [parfadeGroupChannelsCapabilityPattern()]: ["subscribe"],
  };
}

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
      capability: clientCapability(user.id),
      ttl: 60 * 60 * 1000,
    });

    return NextResponse.json(tokenRequest);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST /api/ably/token]", error);
    const dev = process.env.NODE_ENV === "development";
    const details =
      dev && error instanceof Error ? error.message : dev ? String(error) : undefined;
    return NextResponse.json(
      { error: "Unable to issue Ably token.", ...(details ? { details } : {}) },
      { status: 500 },
    );
  }
}
