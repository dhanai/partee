import { apiGet, apiPost } from "./api";

export type RoundResultsWolfSummary = {
  completedSessions: number;
  holesRecorded: number;
  teamWolfHoleWins: number;
  teamPackHoleWins: number;
  tieHoles: number;
};

export type RoundResultsPlayerRow = {
  userId: string;
  name: string;
  avatar: string | null;
  isGuest: boolean;
  wolfPoints: number;
};

export type RoundResultsGameSession = {
  id: string;
  gameType: string;
};

export type RoundResultsResponse = {
  round: {
    id: string;
    inviteToken: string;
    courseName: string;
    teeTime: string | null;
    targetDate: string | null;
    status: string;
    mode: string;
  };
  wolfSummary: RoundResultsWolfSummary | null;
  standings: RoundResultsPlayerRow[];
  highlights: string[];
  gameSessions?: RoundResultsGameSession[];
};

export async function fetchRoundResults(
  token: string | null,
  inviteToken: string,
): Promise<RoundResultsResponse> {
  return apiGet<RoundResultsResponse>(
    `/api/rounds/${encodeURIComponent(inviteToken)}/results`,
    token,
  );
}

export async function completeRound(
  token: string | null,
  inviteToken: string,
): Promise<{ ok: true; status: "completed" }> {
  return apiPost<{ ok: true; status: "completed" }>(
    `/api/rounds/${encodeURIComponent(inviteToken)}/complete`,
    {},
    token,
  );
}
