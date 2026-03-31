import type { GamePlayerRow } from "./games-api";

/** User ids to show on a completed hole tile (avatars); empty → fall back to checkmark. */
export function holeCompletionAvatarUserIds(
  gameType: string,
  payload: Record<string, unknown>,
  players: GamePlayerRow[],
  scoringMode?: string,
): string[] {
  const mode = scoringMode ?? gameType;
  if (mode === "pick_lowest" || gameType === "skins") return skinsHoleAvatarUserIds(payload);
  if (mode === "wolf_pick" || gameType === "wolf") return wolfHoleAvatarUserIds(payload, players);
  if (mode === "enter_strokes") return enterStrokesAvatarUserIds(payload);
  if (mode === "enter_dots") return dotsAvatarUserIds(payload);
  if (mode === "enter_targets") return targetsAvatarUserIds(payload, players);
  return [];
}

function skinsHoleAvatarUserIds(payload: Record<string, unknown>): string[] {
  const raw = payload.result;
  const result = raw === "carry" ? "tie" : raw;
  const ids = payload.winnerUserIds;
  if (!Array.isArray(ids)) return [];
  const strs = [...new Set(ids.map((x) => String(x).trim()).filter(Boolean))];
  if (result === "won") {
    if (strs.length === 1) return strs;
    if (strs.length > 1) return [strs[0]!];
    return [];
  }
  if (result === "tie") return strs;
  return [];
}

function wolfHoleAvatarUserIds(
  payload: Record<string, unknown>,
  players: GamePlayerRow[],
): string[] {
  const wids = payload.winnerUserIds;
  if (Array.isArray(wids) && wids.length > 0) {
    return [...new Set(wids.map((x) => String(x).trim()).filter(Boolean))];
  }

  const outcome = payload.outcome;
  const wolfId = payload.wolfUserId != null ? String(payload.wolfUserId) : "";
  if (!wolfId) return [];

  const wentAlone = Boolean(payload.wentAlone);
  const partnerRaw = payload.partnerUserId;
  const partnerId =
    partnerRaw != null && partnerRaw !== "" ? String(partnerRaw) : null;

  if (outcome === "wolf_won") {
    if (wentAlone) return [wolfId];
    return partnerId ? [wolfId, partnerId] : [wolfId];
  }

  if (outcome === "pack_won") {
    const wolfTeam = new Set<string>([wolfId]);
    if (!wentAlone && partnerId) wolfTeam.add(partnerId);
    return players.map((p) => p.userId).filter((id) => !wolfTeam.has(id));
  }

  return [];
}

function enterStrokesAvatarUserIds(payload: Record<string, unknown>): string[] {
  const scores = payload.scores;
  if (!scores || typeof scores !== "object") return [];
  const entries = Object.entries(scores as Record<string, unknown>)
    .map(([uid, raw]) => {
      const n = typeof raw === "number" ? raw : Number(raw);
      return { uid, n };
    })
    .filter((x) => Number.isFinite(x.n));
  if (entries.length === 0) return [];
  const best = Math.min(...entries.map((x) => x.n));
  return entries.filter((x) => x.n === best).map((x) => x.uid);
}

function dotsAvatarUserIds(payload: Record<string, unknown>): string[] {
  const dots = payload.dots;
  if (!dots || typeof dots !== "object") return [];
  return Object.entries(dots as Record<string, string[]>)
    .filter(([, arr]) => Array.isArray(arr) && arr.length > 0)
    .map(([uid]) => uid);
}

function targetsAvatarUserIds(
  payload: Record<string, unknown>,
  players: GamePlayerRow[],
): string[] {
  const hits = payload.hits;
  if (!hits || typeof hits !== "object") return [];
  const h = hits as Record<string, boolean>;
  return players.map((p) => p.userId).filter((uid) => h[uid] === true);
}
