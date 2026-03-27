import { NextResponse } from "next/server";
import { env } from "@/lib/env";

const STATIC_MAPS_BASE = "https://maps.googleapis.com/maps/api/staticmap";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat")?.trim();
  const lng = searchParams.get("lng")?.trim();

  if (!lat || !lng) {
    return NextResponse.json({ error: "lat and lng are required." }, { status: 400 });
  }

  const size = searchParams.get("size")?.trim() || "800x500";
  const zoom = searchParams.get("zoom")?.trim() || "15";

  const params = new URLSearchParams({
    center: `${lat},${lng}`,
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
