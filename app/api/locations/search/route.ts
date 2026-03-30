import { NextResponse } from "next/server";
import { z } from "zod";
import { searchUsLocations } from "@/lib/places";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const bodySchema = z.object({
  query: z.string().trim().min(2).max(120),
});

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { success } = rateLimit(ip, "location-search", 30, 60_000);
  if (!success) return rateLimitResponse();

  try {
    const body = bodySchema.parse(await req.json());
    const locations = await searchUsLocations(body.query);
    return NextResponse.json({ locations });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid location search payload.", issues: error.flatten() },
        { status: 400 },
      );
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(
      { error: "Unable to search locations right now." },
      { status: 500 },
    );
  }
}
