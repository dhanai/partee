import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const STATIC_MAPS_BASE = "https://maps.googleapis.com/maps/api/staticmap";

const OSM_TILE_USER_AGENT =
  "Parfade/1.0 (course preview; +https://parfade.com)";

/** Slippy tile indices for zoom (OpenStreetMap wiki). */
function latLngToTileXY(lat: number, lon: number, zoom: number) {
  const latRad = (lat * Math.PI) / 180;
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return { x, y };
}

/** Single OSM map tile (PNG) when Google Static Maps is unavailable or misconfigured. */
async function fetchOsmTileAsFallback(lat: number, lon: number, zoom: number) {
  const z = clamp(zoom, 0, 19);
  const { x, y } = latLngToTileXY(lat, lon, z);
  const url = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  return fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": OSM_TILE_USER_AGENT },
  });
}

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

  const zoomNum = parseInt(zoom, 10) || 15;
  const googleKey = env.server.GOOGLE_PLACES_API_KEY?.trim();

  let upstream: Awaited<ReturnType<typeof fetch>>;

  if (googleKey) {
    const googleParams = new URLSearchParams({
      center: `${latNum},${lngNum}`,
      zoom,
      size,
      maptype: "satellite",
      key: googleKey,
    });
    upstream = await fetch(`${STATIC_MAPS_BASE}?${googleParams.toString()}`, {
      cache: "no-store",
    });
  } else {
    upstream = new Response(null, { status: 503 });
  }

  const googleOk =
    upstream.ok &&
    upstream.body &&
    (upstream.headers.get("content-type") ?? "").toLowerCase().includes("image");

  if (!googleOk) {
    upstream = await fetchOsmTileAsFallback(latNum, lngNum, zoomNum);
  }

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
