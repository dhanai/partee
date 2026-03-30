import type { ReactNode } from "react";
import { useEffect, useMemo, useReducer } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { toAbsoluteUrl } from "../lib/api";
import { getCachedRoundDetails, subscribeRoundDetailCache } from "../lib/round-details-cache";
import { normalizeRoundListMode, resolveTournamentTitle } from "../lib/round-card-meta";
import { RoundCoverImage } from "./round-cover-image";
import {
  planningWindowTheme,
  type PlanningTimeWindow,
} from "../lib/planning-window-theme";
import { colors } from "../lib/theme";
import {
  type ConfirmedSpotPlayer,
  ConfirmedSpotsRow,
} from "./confirmed-spots-row";
import { PlanningRoundBadge } from "./planning-round-badge";

export type { PlanningTimeWindow };

export type RoundListCardProps = {
  roundId: string;
  /** `tournament` uses the scheduled layout (hero image) with tournament title as headline. */
  mode: "scheduled" | "planning" | "tournament";
  courseName: string | null;
  /** Shown as primary headline for tournament cards when set; falls back to course name. */
  tournamentTitle?: string | null;
  /** When set, headline also reads from detail cache after prefetch/open (same token). */
  inviteToken?: string;
  imageUrl: string;
  joinPolicy: "instant" | "approval";
  totalSpots: number;
  confirmedPlayers: ConfirmedSpotPlayer[];
  onPress: () => void;
  /** Prefetch details (e.g. `prefetchRoundDetails`) while the user is pressing the card. */
  onCardPressIn?: () => void;
  /** Scheduled: date + time line. Planning: time-of-day line (combined with location in-card). */
  primaryMeta: string;
  planningLocation?: string | null;
  /** Planning mode: short date in the top-left (weekday, Mon D). */
  planningHeaderDate?: string;
  /** Planning mode: tints card + pill by time of day. */
  preferredTimeWindow?: PlanningTimeWindow;
  onPlayerPress?: (player: ConfirmedSpotPlayer) => void;
  onPlayerPressIn?: (player: ConfirmedSpotPlayer) => void;
  /** e.g. Joined tab “Pending” pill */
  trailingAfterSpots?: ReactNode;
  /** e.g. Invited tab claim / decline */
  footer?: ReactNode;
  /**
   * Delays press feedback so a horizontal row swipe can steal the gesture without
   * Pressable cancel → visual flash (e.g. My Rounds swipe rows).
   */
  delayPressIn?: number;
};

export function RoundListCard({
  roundId,
  mode,
  courseName,
  tournamentTitle,
  inviteToken,
  imageUrl,
  joinPolicy,
  totalSpots,
  confirmedPlayers,
  onPress,
  onCardPressIn,
  primaryMeta,
  planningLocation,
  planningHeaderDate,
  preferredTimeWindow,
  onPlayerPress,
  onPlayerPressIn,
  trailingAfterSpots,
  footer,
  delayPressIn,
}: RoundListCardProps) {
  const modeNorm = normalizeRoundListMode(mode);
  const [detailCacheGeneration, bumpFromDetailCache] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!inviteToken?.trim()) return;
    return subscribeRoundDetailCache(inviteToken.trim(), bumpFromDetailCache);
  }, [inviteToken]);

  const displayTournamentTitle = useMemo(() => {
    const fromList = tournamentTitle?.trim();
    if (fromList) return fromList;
    const t = inviteToken?.trim();
    if (!t) return null;
    const cached = getCachedRoundDetails(t);
    return cached ? resolveTournamentTitle(cached) : null;
  }, [tournamentTitle, inviteToken, detailCacheGeneration]);

  const planningMetaLine =
    modeNorm === "planning"
      ? planningLocation?.trim()
        ? `${primaryMeta} · ${planningLocation.trim()}`
        : primaryMeta
      : null;

  const planningTheme =
    modeNorm === "planning" ? planningWindowTheme(preferredTimeWindow) : null;

  /** Tournament layout when mode says so, or list omitted title but we have it from detail cache / title field. */
  const isTournamentCard =
    modeNorm === "tournament" ||
    (modeNorm !== "planning" && Boolean(displayTournamentTitle));
  const isScheduledLike =
    modeNorm === "scheduled" ||
    modeNorm === "tournament" ||
    (modeNorm !== "planning" && Boolean(displayTournamentTitle));
  const tournamentHeadline = isTournamentCard
    ? displayTournamentTitle || courseName?.trim() || "Course TBD"
    : null;
  const showCourseSubline =
    isTournamentCard &&
    Boolean(displayTournamentTitle) &&
    Boolean(courseName?.trim()) &&
    displayTournamentTitle!.toLowerCase() !== courseName!.trim().toLowerCase();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        modeNorm === "planning" && styles.planningCard,
        planningTheme?.card,
        pressed && { opacity: 0.85 },
      ]}
      unstable_pressDelay={delayPressIn}
      android_ripple={delayPressIn != null && delayPressIn > 0 ? null : undefined}
      onPressIn={onCardPressIn}
      onPress={onPress}
    >
      <View style={styles.cardBody}>
        <View style={styles.cardForeground} pointerEvents="box-none">
          <View style={styles.cardPressInner} pointerEvents="none">
            {isScheduledLike ? (
              <>
                <RoundCoverImage
                  recyclingKey={`${roundId}:${imageUrl}`}
                  uri={toAbsoluteUrl(imageUrl)}
                  style={styles.cardImage}
                  transitionMs={260}
                />
                <View style={styles.topRow}>
                  <View style={styles.titleBlock}>
                    <Text style={styles.cardTitle} numberOfLines={isTournamentCard ? 3 : 2}>
                      {isTournamentCard ? tournamentHeadline : courseName ?? "Course TBD"}
                    </Text>
                    {showCourseSubline ? (
                      <Text style={styles.courseSubline} numberOfLines={2}>
                        {courseName}
                      </Text>
                    ) : null}
                  </View>
                  <Text
                    style={isTournamentCard ? styles.badgeTournament : styles.badgeMuted}
                  >
                    {isTournamentCard
                      ? "Tournament"
                      : joinPolicy === "instant"
                        ? "Instant"
                        : "Approval"}
                  </Text>
                </View>
                <Text style={styles.cardMeta}>{primaryMeta}</Text>
              </>
            ) : (
              <>
                <View style={styles.topRow}>
                  <Text style={styles.planDate}>
                    {planningHeaderDate ??
                      new Date().toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                  </Text>
                  <PlanningRoundBadge preferredTimeWindow={preferredTimeWindow} />
                </View>
                <Text style={styles.cardMeta}>{planningMetaLine}</Text>
              </>
            )}
          </View>
          <View style={styles.spotsRow} pointerEvents="box-none">
            <View style={styles.spotsRowMain} pointerEvents="box-none">
              <ConfirmedSpotsRow
                roundId={roundId}
                totalSpots={totalSpots}
                players={confirmedPlayers}
                size="sm"
                initialTone="fairway"
                onPlayerPress={onPlayerPress}
                onPlayerPressIn={onPlayerPressIn}
              />
            </View>
            {trailingAfterSpots ? (
              <View style={styles.trailingWrap} pointerEvents="none">
                {trailingAfterSpots}
              </View>
            ) : null}
          </View>
        </View>
      </View>
      {footer}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 11,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 0,
  },
  planningCard: {
    borderStyle: "dashed",
  },
  cardBody: {
    position: "relative",
  },
  cardForeground: {
    gap: 8,
  },
  cardPressInner: {
    gap: 8,
  },
  cardImage: {
    width: "100%",
    height: 132,
    borderRadius: 12,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
  },
  courseSubline: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.muted,
  },
  planDate: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    flex: 1,
  },
  cardMeta: { color: colors.muted },
  badgeMuted: {
    backgroundColor: "#f1efea",
    color: colors.muted,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
    fontWeight: "600",
  },
  badgeTournament: {
    backgroundColor: "#f5f0d8",
    color: colors.text,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
    fontWeight: "700",
    borderWidth: 1,
    borderColor: "rgba(201, 162, 39, 0.35)",
  },
  spotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  spotsRowMain: {
    flex: 1,
    minWidth: 0,
  },
  trailingWrap: {
    flexShrink: 0,
  },
});
