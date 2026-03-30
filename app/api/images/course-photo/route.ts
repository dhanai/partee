import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const GOOGLE_PHOTO_BASE = "https://maps.googleapis.com/maps/api/place/photo";
const DEFAULT_MAX_WIDTH = 1200;
const MAX_REF_LENGTH = 500;

export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { success } = rateLimit(ip, "course-photo", 60, 60_000);
  if (!success) return rateLimitResponse();

  const { searchParams } = new URL(req.url);
  const ref = searchParams.get("ref")?.trim();

  if (!ref || ref.length > MAX_REF_LENGTH) {
    return NextResponse.json({ error: "Valid photo reference is required." }, { status: 400 });
  }

  const rawWidth = parseInt(searchParams.get("maxwidth")?.trim() || "", 10);
  const maxWidth = String(Math.max(100, Math.min(1600, isNaN(rawWidth) ? DEFAULT_MAX_WIDTH : rawWidth)));

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
