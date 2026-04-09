import { useRef, type ReactNode } from "react";
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
  /** Host overflow menu; single tap still opens profile when set with onPlayerPress. */
  onPlayerLongPress?: (player: ConfirmedSpotPlayer) => void;
};

const SIZES = {
  sm: { dim: 24, gap: 6, font: 11 },
  md: { dim: 32, gap: 8, font: 12 },
} as const;

function RoundSpotAvatarPressable({
  player,
  onPlayerPress,
  onPlayerPressIn,
  onPlayerLongPress,
  children,
}: {
  player: ConfirmedSpotPlayer;
  onPlayerPress?: (p: ConfirmedSpotPlayer) => void;
  onPlayerPressIn?: (p: ConfirmedSpotPlayer) => void;
  onPlayerLongPress?: (p: ConfirmedSpotPlayer) => void;
  children: ReactNode;
}) {
  const suppressNextPress = useRef(false);
  if (!onPlayerPress && !onPlayerLongPress) {
    return <>{children}</>;
  }
  return (
    <Pressable
      accessibilityLabel={`${player.name}, view profile`}
      accessibilityRole="button"
      delayLongPress={450}
      hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
      onLongPress={
        onPlayerLongPress
          ? () => {
              suppressNextPress.current = true;
              onPlayerLongPress(player);
            }
          : undefined
      }
      onPress={() => {
        if (suppressNextPress.current) {
          suppressNextPress.current = false;
          return;
        }
        onPlayerPress?.(player);
      }}
      onPressIn={() => onPlayerPressIn?.(player)}
    >
      {children}
    </Pressable>
  );
}

export function ConfirmedSpotsRow({
  roundId,
  totalSpots,
  players,
  size = "sm",
  initialTone = "fairway",
  onPlayerPress,
  onPlayerPressIn,
  onPlayerLongPress,
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

        if (onPlayerPress || onPlayerLongPress) {
          return (
            <RoundSpotAvatarPressable
              key={key}
              player={player}
              onPlayerPress={onPlayerPress}
              onPlayerPressIn={onPlayerPressIn}
              onPlayerLongPress={onPlayerLongPress}
            >
              {avatarInner}
            </RoundSpotAvatarPressable>
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
  onPlayerLongPress?: (player: ConfirmedSpotPlayer) => void;
};

/** Same avatar treatment as {@link ConfirmedSpotsRow}, horizontal scroll when the list is long. */
export function HostInvitedSpotsScrollRow({
  roundId,
  players,
  size = "md",
  initialTone = "muted",
  onPlayerPress,
  onPlayerPressIn,
  onPlayerLongPress,
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

        if (onPlayerPress || onPlayerLongPress) {
          return (
            <RoundSpotAvatarPressable
              key={key}
              player={player}
              onPlayerPress={onPlayerPress}
              onPlayerPressIn={onPlayerPressIn}
              onPlayerLongPress={onPlayerLongPress}
            >
              {avatarInner}
            </RoundSpotAvatarPressable>
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
