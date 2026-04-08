import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { toAbsoluteUrl } from "../lib/api";
import { colors } from "../lib/theme";

export type ConfirmedSpotPlayer = {
  id: string;
  name: string;
  avatar: string | null;
};

type Props = {
  roundId: string;
  totalSpots: number;
  players: ConfirmedSpotPlayer[];
  size?: "sm" | "md";
  /** Initial letter color for avatar fallback */
  initialTone?: "fairway" | "muted";
  onPlayerPress?: (player: ConfirmedSpotPlayer) => void;
  onPlayerPressIn?: (player: ConfirmedSpotPlayer) => void;
};

const SIZES = {
  sm: { dim: 24, gap: 6, font: 11 },
  md: { dim: 32, gap: 8, font: 12 },
} as const;

export function ConfirmedSpotsRow({
  roundId,
  totalSpots,
  players,
  size = "sm",
  initialTone = "fairway",
  onPlayerPress,
  onPlayerPressIn,
}: Props) {
  const s = SIZES[size];
  const dimStyle = { width: s.dim, height: s.dim, borderRadius: s.dim / 2 };

  return (
    <View style={[styles.row, { gap: s.gap }]} pointerEvents="box-none">
      {Array.from({ length: Math.max(0, totalSpots) }).map((_, idx) => {
        const player = players[idx] ?? null;
        const key = `${roundId}-spot-${idx}`;

        if (!player) {
          return (
            <View key={key} style={[styles.empty, dimStyle]} pointerEvents="none" />
          );
        }

        const avatarInner =
          player.avatar ? (
            <Image
              source={{ uri: toAbsoluteUrl(player.avatar) }}
              style={[styles.avatarBase, dimStyle]}
            />
          ) : (
            <View style={[styles.avatarBase, styles.fallback, dimStyle]}>
              <Text
                style={[
                  styles.initial,
                  { fontSize: s.font },
                  initialTone === "fairway" ? styles.initialFairway : styles.initialMuted,
                ]}
              >
                {(player.name ?? "?").trim().charAt(0).toUpperCase() || "?"}
              </Text>
            </View>
          );

        if (onPlayerPress) {
          return (
            <Pressable
              key={key}
              accessibilityLabel={`${player.name}, view profile`}
              accessibilityRole="button"
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              onPress={() => onPlayerPress(player)}
              onPressIn={() => onPlayerPressIn?.(player)}
            >
              {avatarInner}
            </Pressable>
          );
        }

        return (
          <View key={key}>
            {avatarInner}
          </View>
        );
      })}
    </View>
  );
}

type InvitedScrollProps = {
  roundId: string;
  players: ConfirmedSpotPlayer[];
  size?: "sm" | "md";
  initialTone?: "fairway" | "muted";
  onPlayerPress?: (player: ConfirmedSpotPlayer) => void;
  onPlayerPressIn?: (player: ConfirmedSpotPlayer) => void;
};

/** Same avatar treatment as {@link ConfirmedSpotsRow}, horizontal scroll when the list is long. */
export function HostInvitedSpotsScrollRow({
  roundId,
  players,
  size = "md",
  initialTone = "muted",
  onPlayerPress,
  onPlayerPressIn,
}: InvitedScrollProps) {
  const s = SIZES[size];
  const dimStyle = { width: s.dim, height: s.dim, borderRadius: s.dim / 2 };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={players.length > 6}
      style={styles.invitedScroll}
      contentContainerStyle={[styles.invitedScrollContent, { gap: s.gap }]}
      keyboardShouldPersistTaps="handled"
    >
      {players.map((player) => {
        const avatarInner =
          player.avatar ? (
            <Image
              source={{ uri: toAbsoluteUrl(player.avatar) }}
              style={[styles.avatarBase, dimStyle]}
            />
          ) : (
            <View style={[styles.avatarBase, styles.fallback, dimStyle]}>
              <Text
                style={[
                  styles.initial,
                  { fontSize: s.font },
                  initialTone === "fairway" ? styles.initialFairway : styles.initialMuted,
                ]}
              >
                {(player.name ?? "?").trim().charAt(0).toUpperCase() || "?"}
              </Text>
            </View>
          );

        const key = `${roundId}-${player.id}`;

        if (onPlayerPress) {
          return (
            <Pressable
              key={key}
              accessibilityLabel={`${player.name}, view profile`}
              accessibilityRole="button"
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              onPress={() => onPlayerPress(player)}
              onPressIn={() => onPlayerPressIn?.(player)}
            >
              {avatarInner}
            </Pressable>
          );
        }

        return (
          <View key={key}>
            {avatarInner}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  invitedScroll: { flexGrow: 0 },
  invitedScrollContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  avatarBase: {},
  empty: {
    backgroundColor: "#e9e5de",
    borderWidth: 1,
    borderColor: "#ddd6cc",
  },
  fallback: {
    backgroundColor: colors.fairwaySoft,
    borderWidth: 1,
    borderColor: "#cfe4d4",
    alignItems: "center",
    justifyContent: "center",
  },
  initial: {
    fontWeight: "700",
  },
  initialFairway: {
    color: colors.fairway,
  },
  initialMuted: {
    color: colors.muted,
  },
});
