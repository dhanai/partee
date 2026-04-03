import { StyleSheet } from "react-native";
import { colors } from "./theme";

/**
 * Shared text styles for the profile activity feed (posts, games, round rows)
 * so dates, badges, and primary copy stay visually consistent.
 */
export const profileActivityFeedTypography = StyleSheet.create({
  /** Date under a post header or under a game headline (matches post timestamp row). */
  date: {
    fontSize: 12,
    fontWeight: "400",
    color: colors.muted,
  },
  /** Uppercase row label: "Hosting", "Joined", "Game", etc. */
  badge: {
    alignSelf: "flex-start",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  /** Post author name / equivalent header emphasis. */
  authorName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  /** Post body and game headline base (names use emphasis). */
  primaryBody: {
    fontSize: 15,
    fontWeight: "400",
    color: colors.text,
    lineHeight: 21,
  },
  primaryBodyEmphasis: {
    fontWeight: "700",
  },
});
