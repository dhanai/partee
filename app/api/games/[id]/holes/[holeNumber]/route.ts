import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { gameHoleEvents, gameSessions } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import type { GameTypeKey } from "@/lib/games/payload-schemas";
import type { WolfHolePayload } from "@/lib/games/payload-schemas";
import { parseHolePayload } from "@/lib/games/payload-schemas";
import { validateWolfPayloadWolfUser } from "@/lib/games/wolf-hole-validation";
import { toIso } from "@/lib/games/serialize";
import { loadSessionWithPlayers, userIsGameParticipant } from "@/lib/games/session-queries";

type RouteContext = { params: Promise<{ id: string; holeNumber: string }> };

const putBodySchema = z.object({
  payload: z.unknown(),
  /** Omit on first create; must match current row version on update. */
  expectedVersion: z.number().int().min(1).optional(),
});

export async function PUT(req: Request, context: RouteContext) {
  try {
    const user = await requireDbUser(req);
    const { id: sessionId, holeNumber: holeParam } = await context.params;
    if (!z.string().uuid().safeParse(sessionId).success) {
      return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
    }

    const holeNumber = Number(holeParam);
    if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 27) {
      return NextResponse.json({ error: "Invalid hole number" }, { status: 400 });
    }

    const allowed = await userIsGameParticipant(sessionId, user.id);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const loaded = await loadSessionWithPlayers(sessionId);
    if (!loaded) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { session, players } = loaded;
    if (holeNumber > session.holesCount) {
      return NextResponse.json(
        { error: `Hole must be 1–${session.holesCount} for this session` },
        { status: 400 },
      );
    }

    const playerUserIds = players.map((p) => p.userId);
    const body = putBodySchema.parse(await req.json());

    let validatedPayload: Record<string, unknown>;
    try {
      validatedPayload = parseHolePayload(
        session.gameType as GameTypeKey,
        body.payload,
        playerUserIds,
      );
      if (session.gameType === "wolf") {
        const wolfErr = validateWolfPayloadWolfUser(
          session.settings as Record<string, unknown>,
          holeNumber,
          validatedPayload as WolfHolePayload,
        );
        if (wolfErr) {
          return NextResponse.json({ error: wolfErr }, { status: 400 });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid payload";
      if (err instanceof z.ZodError) {
        return NextResponse.json(
          { error: "Invalid payload.", issues: err.flatten() },
          { status: 400 },
        );
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const now = new Date();

    const [existing] = await db
      .select()
      .from(gameHoleEvents)
      .where(
        and(
          eq(gameHoleEvents.sessionId, sessionId),
          eq(gameHoleEvents.holeNumber, holeNumber),
        ),
      );

    if (existing) {
      if (body.expectedVersion == null) {
        return NextResponse.json(
          { error: "expectedVersion required when updating an existing hole" },
          { status: 400 },
        );
      }
      if (body.expectedVersion !== existing.version) {
        return NextResponse.json(
          {
            error: "Version conflict",
            currentVersion: existing.version,
          },
          { status: 409 },
        );
      }

      const [row] = await db
        .update(gameHoleEvents)
        .set({
          payload: validatedPayload,
          version: existing.version + 1,
          recordedBy: user.id,
          updatedAt: now,
        })
        .where(eq(gameHoleEvents.id, existing.id))
        .returning();

      await db
        .update(gameSessions)
        .set({ updatedAt: now })
        .where(eq(gameSessions.id, sessionId));

      return NextResponse.json({
        hole: {
          holeNumber: row!.holeNumber,
          version: row!.version,
          recordedBy: row!.recordedBy,
          payload: row!.payload,
          updatedAt: toIso(row!.updatedAt),
        },
      });
    }

    if (body.expectedVersion != null) {
      return NextResponse.json(
        { error: "Do not send expectedVersion when creating the first record for this hole" },
        { status: 400 },
      );
    }

    const [row] = await db
      .insert(gameHoleEvents)
      .values({
        sessionId,
        holeNumber,
        version: 1,
        recordedBy: user.id,
        payload: validatedPayload,
        updatedAt: now,
      })
      .returning();

    await db
      .update(gameSessions)
      .set({ updatedAt: now })
      .where(eq(gameSessions.id, sessionId));

    return NextResponse.json({
      hole: {
        holeNumber: row!.holeNumber,
        version: row!.version,
        recordedBy: row!.recordedBy,
        payload: row!.payload,
        updatedAt: toIso(row!.updatedAt),
      },
    });
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
