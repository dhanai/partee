import { NextResponse } from "next/server";
import { getEnabledGameTypes, toPublicGameType } from "@/lib/game-types-config";

export async function GET() {
  try {
    const types = await getEnabledGameTypes();
    return NextResponse.json(types.map(toPublicGameType));
  } catch (error) {
    console.error("[GET /api/game-types]", error);
    return NextResponse.json({ error: "Unable to load game types." }, { status: 500 });
  }
}
