import { apiGet, apiPatch, apiPost, apiPut } from "./api";
import type { GameTypeId } from "./games-registry";

export type GameSessionSummary = {
  id: string;
  gameType: GameTypeId;
  createdBy: string;
  roundId: string | null;
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
    roundInviteToken?: string;
    holesCount?: number;
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
  session: GameSessionSummary;
  players: GamePlayerRow[];
  holes: GameHoleRow[];
}> {
  return apiGet(`/api/games/${sessionId}`, token);
}

export async function updateGameSessionStatus(
  token: string | null,
  sessionId: string,
  status: "active" | "completed" | "abandoned",
): Promise<{ session: GameSessionSummary }> {
  return apiPatch(`/api/games/${sessionId}`, { status }, token);
}

export async function putGameHole(
  token: string | null,
  sessionId: string,
  holeNumber: number,
  body: { payload: unknown; expectedVersion?: number },
): Promise<{ hole: GameHoleRow }> {
  return apiPut(`/api/games/${sessionId}/holes/${holeNumber}`, body, token);
}
