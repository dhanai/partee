import {
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
    notificationsLastViewedAt: timestamp("notifications_last_viewed_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    clerkIdUnique: uniqueIndex("users_clerk_id_unique").on(table.clerkId),
    emailUnique: uniqueIndex("users_email_unique").on(table.email),
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

export type User = typeof users.$inferSelect;
export type Round = typeof rounds.$inferSelect;
export type Spot = typeof spots.$inferSelect;
export type Course = typeof courses.$inferSelect;
export type UserFollow = typeof userFollows.$inferSelect;
