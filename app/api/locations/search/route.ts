import { NextResponse } from "next/server";
import { z } from "zod";
import { searchUsLocations } from "@/lib/places";

const bodySchema = z.object({
  query: z.string().trim().min(2).max(120),
});

export async function POST(req: Request) {
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
