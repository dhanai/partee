import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { contentReports } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";

const reportSchema = z.object({
  contentType: z.string().min(1),
  contentId: z.string().min(1),
  reason: z.string().min(1).max(2000),
  targetUserId: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  try {
    const viewer = await requireDbUser(req);
    const body = await req.json();
    const input = reportSchema.parse(body);

    const [report] = await db
      .insert(contentReports)
      .values({
        reporterId: viewer.id,
        contentType: input.contentType,
        contentId: input.contentId,
        reason: input.reason,
        targetUserId: input.targetUserId ?? null,
      })
      .returning();

    return NextResponse.json({ success: true, id: report.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to submit report." }, { status: 500 });
  }
}
