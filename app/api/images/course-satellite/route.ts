import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const STATIC_MAPS_BASE = "https://maps.googleapis.com/maps/api/staticmap";

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

function parseSize(raw: string): string {
  const m = raw.match(/^(\d+)x(\d+)$/);
  if (!m) return "800x500";
  const w = clamp(parseInt(m[1], 10), 100, 800);
  const h = clamp(parseInt(m[2], 10), 100, 600);
  return `${w}x${h}`;
}

export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { success } = rateLimit(ip, "course-satellite", 60, 60_000);
  if (!success) return rateLimitResponse();

  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat")?.trim();
  const lng = searchParams.get("lng")?.trim();

  if (!lat || !lng) {
    return NextResponse.json({ error: "lat and lng are required." }, { status: 400 });
  }

  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  if (isNaN(latNum) || isNaN(lngNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
    return NextResponse.json({ error: "Invalid coordinates." }, { status: 400 });
  }

  const size = parseSize(searchParams.get("size")?.trim() || "800x500");
  const zoom = String(clamp(parseInt(searchParams.get("zoom")?.trim() || "15", 10) || 15, 1, 20));

  const params = new URLSearchParams({
    center: `${latNum},${lngNum}`,
    zoom,
    size,
    maptype: "satellite",
    key: env.server.GOOGLE_PLACES_API_KEY,
  });

  const upstream = await fetch(`${STATIC_MAPS_BASE}?${params.toString()}`, {
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.redirect(new URL("/images/event-fallback.svg", req.url), 302);
  }

  const contentType = upstream.headers.get("content-type") ?? "image/png";
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
