import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { rounds, spots } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { delay } from "@/lib/utils";

const joinSchema = z.object({
  action: z.enum(["claim", "decline", "request"]).default("claim"),
});

type RouteContext = {
  params: { token: string };
};

function desiredStatus(action: z.infer<typeof joinSchema>["action"], joinPolicy: "instant" | "approval") {
  if (action === "decline") {
    return "declined" as const;
  }
  if (action === "request" || joinPolicy === "approval") {
    return "requested" as const;
  }
  return "confirmed" as const;
}

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const user = await requireDbUser();
    const parsed = joinSchema.parse(await req.json());

    const [round] = await db
      .select()
      .from(rounds)
      .where(eq(rounds.inviteToken, params.token));

    if (!round) {
      return NextResponse.json({ error: "Round not found." }, { status: 404 });
    }

    const targetStatus = desiredStatus(parsed.action, round.joinPolicy);
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      const [existing] = await db
        .select()
        .from(spots)
        .where(and(eq(spots.roundId, round.id), eq(spots.userId, user.id)));

      if (existing?.status === targetStatus) {
        return NextResponse.json({ ok: true, status: existing.status });
      }

      const [confirmedCountResult] = await db
        .select({
          confirmedCount:
            sql<number>`coalesce(sum(case when ${spots.status} = 'confirmed' then 1 else 0 end), 0)`.mapWith(
              Number,
            ),
        })
        .from(spots)
        .where(eq(spots.roundId, round.id));

      const confirmedCount = confirmedCountResult?.confirmedCount ?? 0;
      if (targetStatus === "confirmed" && confirmedCount >= round.totalSpots) {
        return NextResponse.json({ error: "Round is full." }, { status: 409 });
      }

      if (existing) {
        const updated = await db
          .update(spots)
          .set({
            status: targetStatus,
            version: existing.version + 1,
          })
          .where(and(eq(spots.id, existing.id), eq(spots.version, existing.version)))
          .returning({ id: spots.id });

        if (updated.length > 0) {
          return NextResponse.json({ ok: true, status: targetStatus });
        }
      } else {
        try {
          await db.insert(spots).values({
            roundId: round.id,
            userId: user.id,
            status: targetStatus,
          });
          return NextResponse.json({ ok: true, status: targetStatus });
        } catch {
          // Retry on unique collisions/races.
        }
      }

      await delay(2 ** attempt * 40);
    }

    return NextResponse.json(
      { error: "Spot update conflict. Please retry." },
      { status: 409 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid join payload.", issues: error.flatten() },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to join round." }, { status: 500 });
  }
}
