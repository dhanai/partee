import { NextResponse } from "next/server";
import { eq, max } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { gameHoleEvents, gameSessions, rounds } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { serializeGameSessionForApi, toIso } from "@/lib/games/serialize";
import { deleteGameSessionIfAllowed } from "@/lib/games/delete-session";
import { loadSessionWithPlayers, userIsGameParticipant } from "@/lib/games/session-queries";
import { publishGameSessionUpdated } from "@/lib/parfade-ably-publish";

type RouteContext = { params: Promise<{ id: string }> };

function gameSessionGetPayload(
  data: NonNullable<Awaited<ReturnType<typeof loadSessionWithPlayers>>>,
  viewerUserId: string,
  roundInviteToken: string | null,
) {
  return {
    viewerIsCreator: data.session.createdBy === viewerUserId,
    viewerUserId,
    session: serializeGameSessionForApi(data.session, { roundInviteToken }),
    players: data.players.map((p) => ({
      userId: p.userId,
      sortOrder: p.sortOrder,
      teamId: p.teamId,
      name: p.name,
      avatar: p.avatar,
      isGuest: p.isGuest,
    })),
    holes: data.holes.map((h) => ({
      holeNumber: h.holeNumber,
      version: h.version,
      recordedBy: h.recordedBy,
      payload: h.payload,
      updatedAt: toIso(h.updatedAt),
    })),
  };
}

export async function GET(req: Request, context: RouteContext) {
  try {
    const user = await requireDbUser(req);
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
    }

    const data = await loadSessionWithPlayers(id);
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const participant = await userIsGameParticipant(id, user.id);
    let allowed = participant;

    if (!allowed) {
      if (data.session.status === "completed") {
        const url = new URL(req.url);
        const profileUserId = url.searchParams.get("profileUserId");
        if (profileUserId && z.string().uuid().safeParse(profileUserId).success) {
          const anchorOk = data.players.some((p) => p.userId === profileUserId);
          if (anchorOk) allowed = true;
        }
      }
    }

    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let roundInviteToken: string | null = null;
    if (data.session.roundId) {
      const [rr] = await db
        .select({ inviteToken: rounds.inviteToken })
        .from(rounds)
        .where(eq(rounds.id, data.session.roundId));
      roundInviteToken = rr?.inviteToken ?? null;
    }

    return NextResponse.json(gameSessionGetPayload(data, user.id, roundInviteToken));
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** Accept 9/18 as number or string (some clients stringify JSON numbers). */
const holesCount918 = z.preprocess((v) => {
  if (v === "9" || v === 9) return 9;
  if (v === "18" || v === 18) return 18;
  return v;
}, z.union([z.literal(9), z.literal(18)]));

const patchBodySchema = z
  .object({
    status: z.enum(["active", "completed", "abandoned"]).optional(),
    holesCount: holesCount918.optional(),
    settings: z
      .object({
        wolfTeeOff: z.enum(["first", "last"]).optional(),
        wolfTieHandling: z.enum(["carry", "wash"]).optional(),
        skinsTieHandling: z.enum(["carry", "wash"]).optional(),
      })
      .optional(),
  })
  .refine(
    (b) =>
      b.status !== undefined ||
      b.holesCount !== undefined ||
      (b.settings !== undefined &&
        (b.settings.wolfTeeOff !== undefined ||
          b.settings.wolfTieHandling !== undefined ||
          b.settings.skinsTieHandling !== undefined)),
    { message: "Provide status, holesCount, or at least one settings field." },
  );

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const user = await requireDbUser(req);
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
    }

    const allowed = await userIsGameParticipant(id, user.id);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = patchBodySchema.parse(await req.json());

    const [existing] = await db.select().from(gameSessions).where(eq(gameSessions.id, id));
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const now = new Date();
    let holesCount = existing.holesCount;
    const settings = { ...(existing.settings as Record<string, unknown>) };
    let status = existing.status;
    let endedAt: Date | null = existing.endedAt;

    if (body.holesCount !== undefined) {
      if (existing.gameType !== "skins" && existing.gameType !== "wolf") {
        return NextResponse.json(
          { error: "holesCount can only be changed for Skins or Wolf games." },
          { status: 400 },
        );
      }
      const [agg] = await db
        .select({ maxN: max(gameHoleEvents.holeNumber) })
        .from(gameHoleEvents)
        .where(eq(gameHoleEvents.sessionId, id));
      const maxHole = Number(agg?.maxN ?? 0);
      if (body.holesCount < maxHole) {
        return NextResponse.json(
          {
            error: `Use at least ${maxHole} holes — those holes already have recorded results.`,
          },
          { status: 400 },
        );
      }
      holesCount = body.holesCount;
    }

    if (body.settings) {
      if (body.settings.wolfTeeOff !== undefined) {
        if (existing.gameType !== "wolf") {
          return NextResponse.json(
            { error: "wolfTeeOff only applies to Wolf games." },
            { status: 400 },
          );
        }
        settings.wolfTeeOff = body.settings.wolfTeeOff;
      }
      if (body.settings.wolfTieHandling !== undefined) {
        if (existing.gameType !== "wolf") {
          return NextResponse.json(
            { error: "wolfTieHandling only applies to Wolf games." },
            { status: 400 },
          );
        }
        settings.wolfTieHandling = body.settings.wolfTieHandling;
      }
      if (body.settings.skinsTieHandling !== undefined) {
        if (existing.gameType !== "skins") {
          return NextResponse.json(
            { error: "skinsTieHandling only applies to Skins games." },
            { status: 400 },
          );
        }
        settings.skinsTieHandling = body.settings.skinsTieHandling;
      }
    }

    if (body.status !== undefined) {
      status = body.status;
      endedAt = body.status === "active" ? null : now;
    }

    const [updated] = await db
      .update(gameSessions)
      .set({
        holesCount,
        settings,
        status,
        endedAt,
        updatedAt: now,
      })
      .where(eq(gameSessions.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const reason = body.status ? "status" : "settings";
    await publishGameSessionUpdated(id, reason).catch((e) =>
      console.error("[PATCH game] ably", e),
    );

    return NextResponse.json({ session: serializeGameSessionForApi(updated) });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid payload.", issues: e.flatten() },
        { status: 400 },
      );
    }
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, context: RouteContext) {
  try {
    const user = await requireDbUser(req);
    const { id } = await context.params;
    const result = await deleteGameSessionIfAllowed(id, user.id);
    if ("ok" in result) {
      await publishGameSessionUpdated(id, "deleted").catch((e) =>
        console.error("[DELETE game] ably", e),
      );
      return NextResponse.json({ ok: true as const });
    }
    return NextResponse.json({ error: result.error }, { status: result.status });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
