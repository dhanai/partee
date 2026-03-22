import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { gameSessionPlayers, gameSessions } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import {
  allUsersExist,
  getRoundByInviteToken,
  loadRoundGameAccessContext,
  playerIdsAllowedForRound,
  viewerCanLinkGameToRound,
} from "@/lib/games/round-game-access";
import { serializeGameSessionForApi } from "@/lib/games/serialize";

const createGameSchema = z
  .object({
    gameType: z.enum(["skins", "wolf", "best_ball", "nassau"]),
    /** Other golfers (mobile omits the creator; server adds `createdBy`). Round flows may include everyone. */
    playerUserIds: z.array(z.string().uuid()).min(1).max(8),
    roundInviteToken: z.string().trim().min(8).max(64).optional(),
    roundId: z.string().uuid().optional(),
    holesCount: z.number().int().min(1).max(27).optional(),
    settings: z.record(z.string(), z.any()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.roundInviteToken && data.roundId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide only one of roundInviteToken or roundId",
      });
    }
  });

export async function POST(req: Request) {
  try {
    const user = await requireDbUser(req);
    const body = createGameSchema.parse(await req.json());

    let roundId: string | null = null;
    if (body.roundInviteToken) {
      const round = await getRoundByInviteToken(body.roundInviteToken.trim());
      if (!round) {
        return NextResponse.json({ error: "Round not found" }, { status: 404 });
      }
      const ok = await viewerCanLinkGameToRound(round.id, user.id);
      if (!ok) {
        return NextResponse.json(
          { error: "You must be the host or a confirmed player on this round" },
          { status: 403 },
        );
      }
      roundId = round.id;
    } else if (body.roundId) {
      const ok = await viewerCanLinkGameToRound(body.roundId, user.id);
      if (!ok) {
        return NextResponse.json(
          { error: "You must be the host or a confirmed player on this round" },
          { status: 403 },
        );
      }
      roundId = body.roundId;
    }

    const playerIds = [...new Set([user.id, ...body.playerUserIds])];

    const minPlayersForGame: Record<(typeof body)["gameType"], number> = {
      skins: 2,
      wolf: 4,
      best_ball: 2,
      nassau: 2,
    };
    const requiredPlayers = minPlayersForGame[body.gameType];
    if (playerIds.length < requiredPlayers) {
      return NextResponse.json(
        {
          error: `At least ${requiredPlayers} players are required for ${body.gameType.replace(/_/g, " ")}.`,
        },
        { status: 400 },
      );
    }
    if (playerIds.length > 8) {
      return NextResponse.json({ error: "At most 8 players" }, { status: 400 });
    }

    if (!(await allUsersExist(playerIds))) {
      return NextResponse.json({ error: "Unknown player user id" }, { status: 400 });
    }

    if (roundId) {
      const ctx = await loadRoundGameAccessContext(roundId);
      if (!ctx) {
        return NextResponse.json({ error: "Round not found" }, { status: 404 });
      }
      if (!playerIdsAllowedForRound(ctx, playerIds)) {
        return NextResponse.json(
          { error: "All players must be the host or confirmed on the linked round" },
          { status: 400 },
        );
      }
    }

    const now = new Date();
    const [session] = await db
      .insert(gameSessions)
      .values({
        gameType: body.gameType,
        createdBy: user.id,
        roundId,
        holesCount: body.holesCount ?? 18,
        settings: body.settings ?? {},
        updatedAt: now,
      })
      .returning();

    if (!session) {
      return NextResponse.json({ error: "Could not create session" }, { status: 500 });
    }

    await db.insert(gameSessionPlayers).values(
      playerIds.map((userId, index) => ({
        sessionId: session.id,
        userId,
        sortOrder: index,
      })),
    );

    return NextResponse.json({
      session: serializeGameSessionForApi(session),
      playerUserIds: playerIds,
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
