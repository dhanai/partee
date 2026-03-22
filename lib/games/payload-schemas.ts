/**
 * Per-hole JSON validation for `game_hole_events.payload`.
 * To add a game type, extend this module and follow docs/GAMES-MODULE.md.
 */
import { z } from "zod";
import { deriveWolfHoleOutcome } from "@/lib/games/wolf-outcome";

export type GameTypeKey = "skins" | "wolf" | "best_ball" | "nassau";

/** Skins: hole result for stats and carry tracking. */
export const skinsHolePayloadSchema = z
  .object({
    result: z.enum(["won", "tie", "carry"]),
    /** Present when result is won; each id must be a session player. */
    winnerUserIds: z.array(z.string().uuid()).default([]),
  })
  .superRefine((data, ctx) => {
    if (data.result === "won") {
      if (data.winnerUserIds.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "winnerUserIds required when result is won",
          path: ["winnerUserIds"],
        });
      }
    } else if (data.winnerUserIds.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "winnerUserIds must be empty unless result is won",
        path: ["winnerUserIds"],
      });
    }
  });

export type SkinsHolePayload = z.infer<typeof skinsHolePayloadSchema>;

/** Wolf: per-hole roles; `winnerUserIds` drives stats (who had low / tied for low). */
export const wolfHolePayloadSchema = z
  .object({
    wolfUserId: z.string().uuid(),
    wentAlone: z.boolean(),
    partnerUserId: z.string().uuid().nullable().optional(),
    /** Who won or tied for best score; empty = halved / no winner. Omitted = legacy (use outcome only). */
    winnerUserIds: z.array(z.string().uuid()).optional(),
    /** Legacy / redundant when winnerUserIds is sent; server normalizes from winners when present. */
    outcome: z.enum(["wolf_won", "pack_won", "tie"]).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.wentAlone) {
      if (data.partnerUserId != null && data.partnerUserId !== "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "partnerUserId must be empty when wentAlone is true",
          path: ["partnerUserId"],
        });
      }
    } else if (!data.partnerUserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "partnerUserId required when not going alone",
        path: ["partnerUserId"],
      });
    }
    if (
      data.partnerUserId &&
      data.partnerUserId === data.wolfUserId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "partner cannot be the wolf",
        path: ["partnerUserId"],
      });
    }
    if (data.winnerUserIds === undefined && data.outcome === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide winnerUserIds (preferred) or legacy outcome",
        path: ["winnerUserIds"],
      });
    }
  });

export type WolfHolePayload = z.infer<typeof wolfHolePayloadSchema>;

function assertSubset(playerSet: Set<string>, ids: string[], label: string) {
  for (const id of ids) {
    if (!playerSet.has(id)) {
      throw new Error(`${label} must be session players`);
    }
  }
}

export function parseHolePayload(
  gameType: GameTypeKey,
  raw: unknown,
  playerUserIds: string[],
): Record<string, unknown> {
  const set = new Set(playerUserIds);
  if (gameType === "skins") {
    const data = skinsHolePayloadSchema.parse(raw);
    assertSubset(set, data.winnerUserIds, "winnerUserIds");
    return data as unknown as Record<string, unknown>;
  }
  if (gameType === "wolf") {
    const data = wolfHolePayloadSchema.parse(raw);
    assertSubset(set, [data.wolfUserId], "wolfUserId");
    if (data.partnerUserId) {
      assertSubset(set, [data.partnerUserId], "partnerUserId");
    }
    if (data.winnerUserIds !== undefined) {
      const unique = [...new Set(data.winnerUserIds)];
      assertSubset(set, unique, "winnerUserIds");
      const derived = deriveWolfHoleOutcome(
        unique,
        data.wolfUserId,
        data.wentAlone,
        data.partnerUserId ?? null,
      );
      if (data.outcome !== undefined && data.outcome !== derived) {
        throw new Error("outcome does not match which side won based on winnerUserIds");
      }
      return {
        wolfUserId: data.wolfUserId,
        wentAlone: data.wentAlone,
        partnerUserId: data.wentAlone ? null : data.partnerUserId ?? null,
        winnerUserIds: unique,
        outcome: derived,
      } as unknown as Record<string, unknown>;
    }
    if (data.outcome === undefined) {
      throw new Error("Wolf hole requires outcome when winnerUserIds is omitted");
    }
    return {
      wolfUserId: data.wolfUserId,
      wentAlone: data.wentAlone,
      partnerUserId: data.wentAlone ? null : data.partnerUserId ?? null,
      outcome: data.outcome,
    } as unknown as Record<string, unknown>;
  }
  throw new Error(`Hole payloads for game type "${gameType}" are not implemented yet`);
}
