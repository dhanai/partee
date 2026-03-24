import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const roundVisibilityEnum = pgEnum("round_visibility", [
  "private",
  "public",
]);
export const roundStatusEnum = pgEnum("round_status", [
  "forming",
  "confirmed",
  "completed",
]);
export const spotStatusEnum = pgEnum("spot_status", [
  "invited",
  "confirmed",
  "declined",
  "requested",
]);
export const joinPolicyEnum = pgEnum("join_policy", ["instant", "approval"]);
export const roundModeEnum = pgEnum("round_mode", ["scheduled", "planning"]);
export const planningTimeWindowEnum = pgEnum("planning_time_window", [
  "morning",
  "afternoon",
  "twilight",
]);
export const followVisibilityEnum = pgEnum("follow_visibility", ["public", "private"]);
export const followStatusEnum = pgEnum("follow_status", ["requested", "accepted"]);
export const notificationEventEnum = pgEnum("notification_event_type", [
  "round_rsvp_accepted",
  "round_rsvp_declined",
]);

export const gameTypeEnum = pgEnum("game_type", [
  "skins",
  "wolf",
  "best_ball",
  "nassau",
]);

export const gameSessionStatusEnum = pgEnum("game_session_status", [
  "active",
  "completed",
  "abandoned",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkId: text("clerk_id").notNull(),
    email: text("email"),
    name: text("name").notNull(),
    avatar: text("avatar"),
    handicap: numeric("handicap", { precision: 5, scale: 2 }),
    homeCourse: text("home_course"),
    followVisibility: followVisibilityEnum("follow_visibility")
      .notNull()
      .default("public"),
    /** When true, rounds this user hosts are omitted from *their own* Discover feed only (visibility is still public vs invite-only). */
    hideHostedRoundsFromDiscover: boolean("hide_hosted_rounds_from_discover")
      .notNull()
      .default(false),
    notificationsLastViewedAt: timestamp("notifications_last_viewed_at", {
      withTimezone: true,
    }),
    /** Expo push token for device notifications (nullable until client registers). */
    expoPushToken: text("expo_push_token"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    clerkIdUnique: uniqueIndex("users_clerk_id_unique").on(table.clerkId),
    emailUnique: uniqueIndex("users_email_unique").on(table.email),
  }),
);

/** Host-facing feed: invitee RSVP (in-app always; push only on accept). */
export const inAppNotifications = pgTable(
  "in_app_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notificationEventEnum("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    data: jsonb("data")
      .$type<{
        roundId: string;
        inviteToken: string;
        actorUserId: string;
      }>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    recipientIdx: index("in_app_notifications_recipient_user_id_idx").on(table.recipientUserId),
    recipientCreatedIdx: index("in_app_notifications_recipient_created_idx").on(
      table.recipientUserId,
      table.createdAt,
    ),
  }),
);

export const courses = pgTable(
  "courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    googlePlaceId: text("google_place_id").notNull(),
    name: text("name").notNull(),
    address: text("address").notNull(),
    lat: numeric("lat", { precision: 10, scale: 7 }).notNull(),
    lng: numeric("lng", { precision: 10, scale: 7 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    cachedAt: timestamp("cached_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    googlePlaceUnique: uniqueIndex("courses_google_place_id_unique").on(
      table.googlePlaceId,
    ),
  }),
);

export const rounds = pgTable(
  "rounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hostId: uuid("host_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mode: roundModeEnum("mode").notNull().default("scheduled"),
    courseId: uuid("course_id").references(() => courses.id, {
      onDelete: "restrict",
    }),
    courseName: text("course_name"),
    teeTime: timestamp("tee_time", { withTimezone: true }),
    targetDate: timestamp("target_date", { withTimezone: true })
      .notNull()
      .defaultNow(),
    preferredTimeWindow: planningTimeWindowEnum("preferred_time_window"),
    planningLocation: text("planning_location"),
    totalSpots: integer("total_spots").notNull(),
    visibility: roundVisibilityEnum("visibility").notNull(),
    status: roundStatusEnum("status").notNull().default("forming"),
    joinPolicy: joinPolicyEnum("join_policy").notNull().default("instant"),
    customImageUrl: text("custom_image_url"),
    inviteToken: text("invite_token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    inviteTokenUnique: uniqueIndex("rounds_invite_token_unique").on(
      table.inviteToken,
    ),
    hostIdx: index("rounds_host_id_idx").on(table.hostId),
    teeTimeIdx: index("rounds_tee_time_idx").on(table.teeTime),
    totalSpotsCheck: check(
      "rounds_total_spots_check",
      sql`${table.totalSpots} >= 2 AND ${table.totalSpots} <= 4`,
    ),
  }),
);

export const spots = pgTable(
  "spots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: spotStatusEnum("status").notNull(),
    version: integer("version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    roundIdx: index("spots_round_id_idx").on(table.roundId),
    userIdx: index("spots_user_id_idx").on(table.userId),
    userRoundUnique: uniqueIndex("spots_round_id_user_id_unique").on(
      table.roundId,
      table.userId,
    ),
  }),
);

/** Modular side games (skins, wolf, …); optional link to a round. */
export const gameSessions = pgTable(
  "game_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameType: gameTypeEnum("game_type").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roundId: uuid("round_id").references(() => rounds.id, {
      onDelete: "set null",
    }),
    status: gameSessionStatusEnum("status").notNull().default("active"),
    holesCount: integer("holes_count").notNull().default(18),
    settings: jsonb("settings")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    createdByIdx: index("game_sessions_created_by_idx").on(table.createdBy),
    roundIdIdx: index("game_sessions_round_id_idx").on(table.roundId),
    statusIdx: index("game_sessions_status_idx").on(table.status),
    holesCountCheck: check(
      "game_sessions_holes_count_check",
      sql`${table.holesCount} >= 1 AND ${table.holesCount} <= 27`,
    ),
  }),
);

export const gameSessionPlayers = pgTable(
  "game_session_players",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => gameSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    teamId: text("team_id"),
  },
  (table) => ({
    sessionIdx: index("game_session_players_session_idx").on(table.sessionId),
    sessionUserUnique: uniqueIndex("game_session_players_session_user_unique").on(
      table.sessionId,
      table.userId,
    ),
  }),
);

/** Latest row per (session, hole_number) — upsert with version for optimistic locking. */
export const gameHoleEvents = pgTable(
  "game_hole_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => gameSessions.id, { onDelete: "cascade" }),
    holeNumber: integer("hole_number").notNull(),
    version: integer("version").notNull().default(1),
    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sessionHoleUnique: uniqueIndex("game_hole_events_session_hole_unique").on(
      table.sessionId,
      table.holeNumber,
    ),
    sessionIdx: index("game_hole_events_session_idx").on(table.sessionId),
    holeNumberCheck: check(
      "game_hole_events_hole_number_check",
      sql`${table.holeNumber} >= 1 AND ${table.holeNumber} <= 27`,
    ),
  }),
);

/** Group chat: host + confirmed players only (enforced in API). */
export const roundMessages = pgTable(
  "round_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    roundCreatedIdx: index("round_messages_round_id_created_at_idx").on(
      table.roundId,
      table.createdAt,
    ),
    roundIdIdx: index("round_messages_round_id_idx").on(table.roundId),
  }),
);

export const chatReadReceipts = pgTable(
  "chat_read_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roundId: uuid("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userRoundUnique: uniqueIndex("chat_read_receipts_user_round_unique").on(
      table.userId,
      table.roundId,
    ),
  }),
);

export const userFollows = pgTable(
  "user_follows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    followerId: uuid("follower_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followedId: uuid("followed_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: followStatusEnum("status").notNull().default("accepted"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    followerIdx: index("user_follows_follower_idx").on(table.followerId),
    followedIdx: index("user_follows_followed_idx").on(table.followedId),
    statusIdx: index("user_follows_status_idx").on(table.status),
    followerFollowedUnique: uniqueIndex("user_follows_follower_followed_unique").on(
      table.followerId,
      table.followedId,
    ),
    noSelfFollow: check("user_follows_no_self_follow", sql`${table.followerId} <> ${table.followedId}`),
  }),
);

/** Admin-managed promos: Discover feed slots + full-screen post-game (mobile). */
export const housePromoConfig = pgTable("house_promo_config", {
  slot: text("slot").primaryKey().notNull(),
  enabled: boolean("enabled").notNull().default(false),
  targetUrl: text("target_url"),
  mediaUrl: text("media_url"),
  mediaKind: text("media_kind"),
  title: text("title").notNull().default(""),
  subtitle: text("subtitle").notNull().default(""),
  ctaLabel: text("cta_label").notNull().default(""),
  discoverMixPercent: integer("discover_mix_percent").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Round = typeof rounds.$inferSelect;
export type Spot = typeof spots.$inferSelect;
export type Course = typeof courses.$inferSelect;
export type UserFollow = typeof userFollows.$inferSelect;
export type InAppNotification = typeof inAppNotifications.$inferSelect;
export type RoundMessage = typeof roundMessages.$inferSelect;
export type ChatReadReceipt = typeof chatReadReceipts.$inferSelect;
export type GameSession = typeof gameSessions.$inferSelect;
export type GameSessionPlayer = typeof gameSessionPlayers.$inferSelect;
export type GameHoleEvent = typeof gameHoleEvents.$inferSelect;
export type HousePromoConfigRow = typeof housePromoConfig.$inferSelect;
