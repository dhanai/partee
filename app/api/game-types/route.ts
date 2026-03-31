import { NextResponse } from "next/server";
import { getEnabledGameTypesFresh, toPublicGameType } from "@/lib/game-types-config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const types = await getEnabledGameTypesFresh();
    return NextResponse.json(types.map(toPublicGameType), {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
      },
    });
  } catch (error) {
    console.error("[GET /api/game-types]", error);
    return NextResponse.json({ error: "Unable to load game types." }, { status: 500 });
  }
}
