export type DiscoverRound = {
  id: string;
  inviteToken: string;
  mode: "scheduled" | "planning";
  preferredTimeWindow: "morning" | "afternoon" | "twilight" | null;
  planningLocation: string | null;
  courseName: string;
  teeTime: string | null;
  targetDate: string;
  effectiveDate: string;
  hostId: string;
  hostName: string;
  hostAvatar: string | null;
  totalSpots: number;
  spotsRemaining: number;
  distanceMiles: number | null;
  joinPolicy: "instant" | "approval";
  imageUrl: string;
  confirmedPlayers: Array<{
    id: string;
    name: string;
    avatar: string | null;
  }>;
};

export type RoundDetails = {
  id: string;
  inviteToken: string;
  mode: "scheduled" | "planning";
  preferredTimeWindow: "morning" | "afternoon" | "twilight" | null;
  planningLocation: string | null;
  courseId?: string | null;
  courseName: string;
  teeTime: string | null;
  targetDate: string;
  visibility: "private" | "public";
  totalSpots: number;
  status: "forming" | "confirmed" | "completed";
  joinPolicy: "instant" | "approval";
  hostId: string;
  hostName: string;
  hostAvatar: string | null;
  customImageUrl?: string | null;
  imageUrl: string;
  confirmedCount: number;
  confirmedPlayers: Array<{
    id: string;
    name: string;
    avatar: string | null;
  }>;
  declinedPlayers: Array<{
    id: string;
    name: string;
    avatar: string | null;
  }>;
  spotsRemaining: number;
  isHost: boolean;
  currentUserSpotStatus: string | null;
  /** Present when the viewer may use group chat; null = no messages yet. */
  lastChatMessage?: {
    body: string;
    senderName: string;
    createdAt: string;
  } | null;
};

export type MineRound = {
  id: string;
  inviteToken: string;
  courseName: string | null;
  teeTime: string | null;
  targetDate: string;
  mode: "scheduled" | "planning";
  preferredTimeWindow: "morning" | "afternoon" | "twilight" | null;
  planningLocation: string | null;
  status: "forming" | "confirmed" | "completed";
  joinPolicy: "instant" | "approval";
  imageUrl: string;
  totalSpots?: number;
  confirmedCount?: number;
  confirmedPlayers?: Array<{
    id: string;
    name: string;
    avatar: string | null;
  }>;
  spotStatus?: "invited" | "confirmed" | "declined" | "requested";
};
