import { NextResponse } from "next/server";
import { loadHousePromosForApi } from "@/lib/house-promo";

function withCors(request: Request, response: NextResponse): NextResponse {
  const origin = request.headers.get("origin");
  if (origin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.append("Vary", "Origin");
  }
  response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  return response;
}

export async function OPTIONS(request: Request) {
  return withCors(request, new NextResponse(null, { status: 204 }));
}

/** Public: mobile + web read promo config (no auth). */
export async function GET(request: Request) {
  try {
    const data = await loadHousePromosForApi();
    return withCors(
      request,
      NextResponse.json(data, {
        headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
      }),
    );
  } catch (e) {
    console.error("[GET /api/promo/house-ads]", e);
    return withCors(request, NextResponse.json({ error: "Unable to load promos." }, { status: 500 }));
  }
}
