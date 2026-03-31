import { NextResponse } from "next/server";
import { getEnabledGameTypesFresh, toPublicGameType } from "@/lib/game-types-config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const types = await getEnabledGameTypesFresh();
    return NextResponse.json(types.map(toPublicGameType));
  } catch (error) {
    console.error("[GET /api/game-types]", error);
    return NextResponse.json({ error: "Unable to load game types." }, { status: 500 });
  }
}
