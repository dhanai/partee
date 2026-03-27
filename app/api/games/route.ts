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
import { buildGuestPlayersFromNames } from "@/lib/games/guest-players";
import { shuffleUserIds } from "@/lib/games/wolf-rotation";
import { serializeGameSessionForApi } from "@/lib/games/serialize";
import { getGameTypeBySlug } from "@/lib/game-types-config";

const createGameSchema = z
  .object({
    gameType: z.string().min(1).max(60),
    playerUserIds: z.array(z.string().uuid()).max(20).default([]),
    guestNames: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
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

    const gameDef = await getGameTypeBySlug(body.gameType);
    if (!gameDef || !gameDef.enabled) {
      return NextResponse.json(
        { error: `Unknown or disabled game type "${body.gameType}".` },
        { status: 400 },
      );
    }

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
    const rosterCap = gameDef.maxPlayers;
    const gameLabel = gameDef.title;

    if (playerIds.length > rosterCap) {
      return NextResponse.json(
        {
          error: `At most ${rosterCap} golfers for ${gameLabel} (Parfade accounts, including you).`,
        },
        { status: 400 },
      );
    }

    const maxGuests = Math.max(0, rosterCap - playerIds.length);
    if (body.guestNames.length > maxGuests) {
      return NextResponse.json(
        {
          error: `At most ${maxGuests} guest name(s) allowed (${playerIds.length} Parfade player(s) already; cap is ${rosterCap} for this game).`,
        },
        { status: 400 },
      );
    }
    const guestPlayers = buildGuestPlayersFromNames(body.guestNames);
    const totalRoster = playerIds.length + guestPlayers.length;

    if (totalRoster < gameDef.minPlayers) {
      return NextResponse.json(
        {
          error: `At least ${gameDef.minPlayers} golfers are required for ${gameLabel} (Parfade + guests).`,
        },
        { status: 400 },
      );
    }
    if (totalRoster > rosterCap) {
      return NextResponse.json(
        { error: `At most ${rosterCap} players total for ${gameLabel}.` },
        { status: 400 },
      );
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

    const baseSettings =
      body.settings && typeof body.settings === "object" && !Array.isArray(body.settings)
        ? { ...body.settings }
        : {};
    delete (baseSettings as { guestPlayers?: unknown }).guestPlayers;

    if (gameDef.scoringMode === "wolf_pick") {
      const teeRaw = (baseSettings as { wolfTeeOff?: unknown }).wolfTeeOff;
      const tieRaw = (baseSettings as { wolfTieHandling?: unknown }).wolfTieHandling;
      (baseSettings as { wolfTeeOff: string }).wolfTeeOff = teeRaw === "last" ? "last" : "first";
      (baseSettings as { wolfTieHandling: string }).wolfTieHandling =
        tieRaw === "wash" ? "wash" : "carry";
      const rosterIds = [...playerIds, ...guestPlayers.map((g) => g.id)];
      (baseSettings as { wolfLetterOrder: string[] }).wolfLetterOrder = shuffleUserIds(rosterIds);
    }

    if (gameDef.scoringMode === "pick_lowest" && gameDef.slug === "skins") {
      const st = (baseSettings as { skinsTieHandling?: unknown }).skinsTieHandling;
      (baseSettings as { skinsTieHandling: string }).skinsTieHandling =
        st === "wash" ? "wash" : "carry";
    }

    const holesOptions = (gameDef.holesOptions ?? [9, 18]) as number[];
    const requestedHoles = body.holesCount ?? holesOptions[holesOptions.length - 1] ?? 18;
    if (holesOptions.length > 0 && !holesOptions.includes(requestedHoles)) {
      return NextResponse.json(
        { error: `holesCount must be one of [${holesOptions.join(", ")}] for ${gameLabel}.` },
        { status: 400 },
      );
    }

    const now = new Date();
    const [session] = await db
      .insert(gameSessions)
      .values({
        gameType: body.gameType,
        createdBy: user.id,
        roundId,
        holesCount: requestedHoles,
        settings: { ...baseSettings, guestPlayers },
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
