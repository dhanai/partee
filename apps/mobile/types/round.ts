export type DiscoverRound = {
  id: string;
  inviteToken: string;
  mode: "scheduled" | "planning" | "tournament";
  preferredTimeWindow: string | null;
  preferredTimeWindows?: string[] | null;
  planningLocation: string | null;
  courseName: string;
  /** Tournament display title; list cards use as headline when set. */
  tournamentTitle?: string | null;
  /** Rare: snake_case from some API layers — prefer {@link tournamentTitle}. */
  tournament_title?: string | null;
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
  mode: "scheduled" | "planning" | "tournament";
  preferredTimeWindow: string | null;
  preferredTimeWindows?: string[] | null;
  planningLocation: string | null;
  courseId?: string | null;
  courseName: string;
  /** From `courses.metadata` (Google Places) when available */
  courseAddress?: string | null;
  courseLatitude?: number | null;
  courseLongitude?: number | null;
  teeTime: string | null;
  targetDate: string;
  visibility: "private" | "public";
  totalSpots: number;
  status: "forming" | "confirmed" | "completed";
  joinPolicy: "instant" | "approval";
  /** Tournament-only display name; falls back to course name when null. */
  tournamentTitle?: string | null;
  tournament_title?: string | null;
  /** Tournament-only markdown-like body (see `TournamentMarkdownBody`). */
  tournamentDetails?: string | null;
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
  /** Pending invite/request spots — excluded from host invite picker (POST /invites skips them). */
  invitedPlayers?: Array<{
    id: string;
    name: string;
    avatar: string | null;
  }>;
  /** Host-only: people with a pending direct invite (`invited` spot, not join-request `requested`). */
  hostInvitedPlayers?: Array<{
    id: string;
    name: string;
    avatar: string | null;
  }>;
  spotsRemaining: number;
  isHost: boolean;
  currentUserSpotStatus: string | null;
  /** Guests who requested to join (host-only); omitted when empty. */
  pendingJoinRequests?: Array<{
    userId: string;
    name: string;
    avatar: string | null;
  }>;
  /** Present when the viewer may use group chat; null = no messages yet. */
  lastChatMessage?: {
    body: string;
    senderName: string;
    createdAt: string;
  } | null;
  conversationId?: string | null;
};

export type MineRound = {
  id: string;
  inviteToken: string;
  courseName: string | null;
  /** Tournament headline on list cards when set. */
  tournamentTitle?: string | null;
  tournament_title?: string | null;
  teeTime: string | null;
  targetDate: string;
  mode: "scheduled" | "planning" | "tournament";
  preferredTimeWindow: string | null;
  preferredTimeWindows?: string[] | null;
  planningLocation: string | null;
  status: "forming" | "confirmed" | "completed";
  joinPolicy: "instant" | "approval";
  imageUrl: string;
  /** Present on profile open-rounds rows; used for list hint hydration. */
  spotsRemaining?: number;
  totalSpots?: number;
  confirmedCount?: number;
  confirmedPlayers?: Array<{
    id: string;
    name: string;
    avatar: string | null;
  }>;
  spotStatus?: "invited" | "confirmed" | "declined" | "requested";
  conversationId?: string | null;
  lastChatMessageAt?: string | null;
  isChatUnread?: boolean;
};
