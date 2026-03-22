/**
 * Per-hole JSON validation for `game_hole_events.payload`.
 * To add a game type, extend this module and follow docs/GAMES-MODULE.md.
 */
import { z } from "zod";
import { deriveWolfHoleOutcome } from "@/lib/games/wolf-outcome";

export type GameTypeKey = "skins" | "wolf" | "best_ball" | "nassau";

/**
 * Skins: tap everyone who shot the lowest gross on the hole.
 * Exactly one → skin won; two or more → tied low, skin carries (same as legacy “carry”).
 * Incoming `carry` normalizes to `tie`.
 */
/** Shape-only parse; win/tie length rules run in `parseHolePayload` after roster canonicalization. */
export const skinsHolePayloadSchema = z
  .object({
    result: z.enum(["won", "tie", "carry"]),
    winnerUserIds: z.array(z.string().trim().min(1)).default([]),
  })
  .transform((d) => ({
    result: d.result === "carry" ? ("tie" as const) : d.result,
    winnerUserIds: [...new Set(d.winnerUserIds.map((s) => s.trim()))],
  }));

export type SkinsHolePayload = { result: "won" | "tie"; winnerUserIds: string[] };

/** Wolf: per-hole roles; `winnerUserIds` drives stats (who had low / tied for low). */
export const wolfHolePayloadSchema = z
  .object({
    wolfUserId: z.string().uuid(),
    wentAlone: z.boolean(),
    partnerUserId: z.string().uuid().nullable().optional(),
    /** Who had the best (lowest) stroke count on the hole — all players who tied that number. Omitted = legacy (use outcome only). */
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
    if (data.winnerUserIds !== undefined && data.winnerUserIds.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Pick at least one player with the best (lowest) score on the hole",
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

/** Map client ids to roster ids (case-insensitive) and drop duplicates. */
function canonicalizeSkinsWinnerIds(ids: string[], rosterUserIds: string[]): string[] {
  const lowerToCanon = new Map(rosterUserIds.map((id) => [id.toLowerCase(), id]));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const c = lowerToCanon.get(raw.trim().toLowerCase());
    if (!c) {
      throw new Error("winnerUserIds must be session players");
    }
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

export function parseHolePayload(
  gameType: GameTypeKey,
  raw: unknown,
  playerUserIds: string[],
): Record<string, unknown> {
  const set = new Set(playerUserIds);
  if (gameType === "skins") {
    const data = skinsHolePayloadSchema.parse(raw);
    const winnerUserIds = canonicalizeSkinsWinnerIds(data.winnerUserIds, playerUserIds);
    if (data.result === "won") {
      if (winnerUserIds.length !== 1) {
        throw new Error("Exactly one winner when a skin is won");
      }
    } else {
      const n = winnerUserIds.length;
      if (n === 1) {
        throw new Error(
          "One player with the low score wins the skin (use won), or select everyone who tied for low",
        );
      }
    }
    return { result: data.result, winnerUserIds } as Record<string, unknown>;
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
