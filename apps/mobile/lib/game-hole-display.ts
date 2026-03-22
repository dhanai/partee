import type { GamePlayerRow } from "./games-api";
import type { GameTypeId } from "./games-registry";

/** User ids to show on a completed hole tile (avatars); empty → fall back to checkmark. */
export function holeCompletionAvatarUserIds(
  gameType: GameTypeId,
  payload: Record<string, unknown>,
  players: GamePlayerRow[],
): string[] {
  if (gameType === "skins") return skinsHoleAvatarUserIds(payload);
  if (gameType === "wolf") return wolfHoleAvatarUserIds(payload, players);
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
