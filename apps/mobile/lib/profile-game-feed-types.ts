export type ProfileGameActivityPayload = {
  sessionId: string;
  gameType: string;
  endedAt: string;
  isPinned?: boolean;
  subject: { id: string; name: string; isGuest: boolean };
  others: { id: string; name: string; isGuest: boolean }[];
};
