import { NextResponse } from "next/server";
import { requireDbUser } from "@/lib/auth";
import { fetchGiphySearchOrTrending } from "@/lib/giphy-search";

export async function GET(req: Request) {
  try {
    await requireDbUser(req);

    if (!process.env.GIPHY_API_KEY?.trim()) {
      return NextResponse.json(
        { error: "GIF search is not available right now." },
        { status: 503 },
      );
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";

    const results = await fetchGiphySearchOrTrending(q.length > 0 ? q : undefined);
    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "GIPHY_API_KEY is not configured.") {
      return NextResponse.json(
        { error: "GIF search is not available right now." },
        { status: 503 },
      );
    }
    console.error("[GET /api/giphy/search]", error);
    return NextResponse.json({ error: "Could not load GIFs." }, { status: 500 });
  }
}
