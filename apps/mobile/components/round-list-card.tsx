import type { ReactNode } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { toAbsoluteUrl } from "../lib/api";
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
  mode: "scheduled" | "planning";
  courseName: string | null;
  imageUrl: string;
  joinPolicy: "instant" | "approval";
  totalSpots: number;
  confirmedPlayers: ConfirmedSpotPlayer[];
  onPress: () => void;
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
};

export function RoundListCard({
  roundId,
  mode,
  courseName,
  imageUrl,
  joinPolicy,
  totalSpots,
  confirmedPlayers,
  onPress,
  primaryMeta,
  planningLocation,
  planningHeaderDate,
  preferredTimeWindow,
  onPlayerPress,
  onPlayerPressIn,
  trailingAfterSpots,
  footer,
}: RoundListCardProps) {
  const planningMetaLine =
    mode === "planning"
      ? planningLocation?.trim()
        ? `${primaryMeta} · ${planningLocation.trim()}`
        : primaryMeta
      : null;

  const planningTheme =
    mode === "planning" ? planningWindowTheme(preferredTimeWindow) : null;

  return (
    <View
      style={[styles.card, mode === "planning" && styles.planningCard, planningTheme?.card]}
    >
      <Pressable onPress={onPress} style={styles.cardPress}>
        <View style={styles.cardPressInner}>
          {mode === "scheduled" ? (
            <>
              <Image
                source={{ uri: toAbsoluteUrl(imageUrl) }}
                style={styles.cardImage}
              />
              <View style={styles.topRow}>
                <Text style={styles.cardTitle}>{courseName ?? "Course TBD"}</Text>
                <Text style={styles.badgeMuted}>
                  {joinPolicy === "instant" ? "Instant" : "Approval"}
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
          <View style={styles.spotsRow}>
            <View style={styles.spotsRowMain}>
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
              <View style={styles.trailingWrap}>{trailingAfterSpots}</View>
            ) : null}
          </View>
        </View>
      </Pressable>
      {footer}
    </View>
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
  cardPress: {},
  cardPressInner: {
    gap: 8,
  },
  cardImage: {
    width: "100%",
    height: 132,
    borderRadius: 12,
    backgroundColor: "#dfe6df",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    flex: 1,
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
