export type ProfileGameActivityPayload = {
  sessionId: string;
  gameType: string;
  endedAt: string;
  subject: { id: string; name: string; isGuest: boolean };
  others: { id: string; name: string; isGuest: boolean }[];
};
