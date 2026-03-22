import { apiGet, apiPatch, apiPost, apiPut } from "./api";
import type { GameTypeId } from "./games-registry";

export type GameSessionSummary = {
  id: string;
  gameType: GameTypeId;
  createdBy: string;
  roundId: string | null;
  /** Present when the session is linked to a round; used to open round recap. */
  roundInviteToken: string | null;
  status: "active" | "completed" | "abandoned";
  holesCount: number;
  settings: Record<string, unknown>;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GamePlayerRow = {
  userId: string;
  sortOrder: number;
  teamId: string | null;
  name: string;
  avatar: string | null;
  /** Write-in golfer; `userId` is a stable id in `session.settings.guestPlayers`, not `users.id`. */
  isGuest?: boolean;
};

export type GameHoleRow = {
  holeNumber: number;
  version: number;
  recordedBy: string;
  payload: Record<string, unknown>;
  updatedAt: string;
};

export async function createGameSession(
  token: string | null,
  body: {
    gameType: GameTypeId;
    playerUserIds: string[];
    /** Display names only; server assigns ids and stores under session `settings.guestPlayers`. */
    guestNames?: string[];
    roundInviteToken?: string;
    holesCount?: number;
    /** Merged into session `settings` (e.g. Wolf: wolfTeeOff, wolfTieHandling). */
    settings?: Record<string, unknown>;
  },
): Promise<{ session: GameSessionSummary; playerUserIds: string[] }> {
  return apiPost("/api/games", body, token);
}

export async function listMyGameSessions(
  token: string | null,
): Promise<{ sessions: GameSessionSummary[] }> {
  return apiGet("/api/games/mine", token);
}

export async function getGameSession(
  token: string | null,
  sessionId: string,
): Promise<{
  viewerIsCreator: boolean;
  viewerUserId: string;
  session: GameSessionSummary;
  players: GamePlayerRow[];
  holes: GameHoleRow[];
}> {
  return apiGet(`/api/games/${sessionId}`, token);
}

export async function deleteGameSession(
  token: string | null,
  sessionId: string,
): Promise<{ ok: true }> {
  // POST avoids 405 from proxies that block DELETE (common with Apache/MAMP in front of Node).
  return apiPost(`/api/games/${sessionId}/delete`, {}, token);
}

export async function updateGameSessionStatus(
  token: string | null,
  sessionId: string,
  status: "active" | "completed" | "abandoned",
): Promise<{ session: GameSessionSummary }> {
  return apiPatch(`/api/games/${sessionId}`, { status }, token);
}

export type PatchGameSessionBody = {
  status?: "active" | "completed" | "abandoned";
  holesCount?: 9 | 18;
  settings?: {
    wolfTeeOff?: "first" | "last";
    wolfTieHandling?: "carry" | "wash";
    skinsTieHandling?: "carry" | "wash";
  };
};

export async function patchGameSession(
  token: string | null,
  sessionId: string,
  body: PatchGameSessionBody,
): Promise<{ session: GameSessionSummary }> {
  return apiPatch(`/api/games/${sessionId}`, body, token);
}

export async function putGameHole(
  token: string | null,
  sessionId: string,
  holeNumber: number,
  body: { payload: unknown; expectedVersion?: number },
): Promise<{ hole: GameHoleRow }> {
  return apiPut(`/api/games/${sessionId}/holes/${holeNumber}`, body, token);
}
