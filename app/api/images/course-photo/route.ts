import { NextResponse } from "next/server";
import { env } from "@/lib/env";

const GOOGLE_PHOTO_BASE = "https://maps.googleapis.com/maps/api/place/photo";
const DEFAULT_MAX_WIDTH = "1200";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ref = searchParams.get("ref")?.trim();
  const maxWidth = searchParams.get("maxwidth")?.trim() || DEFAULT_MAX_WIDTH;

  if (!ref) {
    return NextResponse.json({ error: "Photo reference is required." }, { status: 400 });
  }

  const params = new URLSearchParams({
    photo_reference: ref,
    maxwidth: maxWidth,
    key: env.server.GOOGLE_PLACES_API_KEY,
  });

  const upstream = await fetch(`${GOOGLE_PHOTO_BASE}?${params.toString()}`, {
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.redirect(new URL("/images/event-fallback.svg", req.url), 302);
  }

  const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
