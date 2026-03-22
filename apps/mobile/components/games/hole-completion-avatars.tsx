import { Image } from "expo-image";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { toAbsoluteUrl } from "../../lib/api";
import type { GamePlayerRow } from "../../lib/games-api";
import { colors } from "../../lib/theme";

const DEFAULT_SIZE = 24;
const DEFAULT_OVERLAP = 9;
const MAX_VISIBLE = 5;

/** Single initial centered in a circle (guest / no photo). */
function AvatarInitialFallback({ initial, size }: { initial: string; size: number }) {
  const fontSize = Math.max(10, Math.round(size * 0.4));
  return (
    <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text
        style={[
          styles.fallbackGlyph,
          {
            width: size,
            height: size,
            fontSize,
            lineHeight: size,
          },
        ]}
      >
        {initial}
      </Text>
    </View>
  );
}

type Props = {
  userIds: string[];
  players: GamePlayerRow[];
  /** Avatar diameter */
  size?: number;
  overlap?: number;
};

export function HoleCompletionAvatars({
  userIds,
  players,
  size = DEFAULT_SIZE,
  overlap = DEFAULT_OVERLAP,
}: Props) {
  const byId = new Map(players.map((p) => [p.userId, p]));

  if (userIds.length === 0) {
    return (
      <Ionicons name="checkmark-circle" size={Math.max(22, size + 2)} color={colors.fairway} />
    );
  }

  const visible = userIds.slice(0, MAX_VISIBLE);
  const extra = userIds.length - visible.length;

  return (
    <View style={styles.row}>
      {visible.map((id, i) => {
        const p = byId.get(id);
        const initial = (p?.name ?? "?").trim().charAt(0).toUpperCase() || "?";
        return (
          <View
            key={`${id}-${i}`}
            style={[
              styles.ring,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                marginLeft: i === 0 ? 0 : -overlap,
                zIndex: visible.length - i,
                borderColor: colors.surface,
              },
            ]}
          >
            {p?.avatar ? (
              <Image
                source={{ uri: toAbsoluteUrl(p.avatar) }}
                style={{ width: size, height: size, borderRadius: size / 2 }}
                contentFit="cover"
                accessibilityIgnoresInvertColors
              />
            ) : (
              <AvatarInitialFallback initial={initial} size={size} />
            )}
          </View>
        );
      })}
      {extra > 0 ? (
        <Text style={[styles.plus, visible.length > 0 ? { marginLeft: 4 } : null]}>+{extra}</Text>
      ) : null}
    </View>
  );
}

/** Single circle for standings rows */
export function StandingAvatar({ player, size = 32 }: { player: GamePlayerRow; size?: number }) {
  const initial = (player.name ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <View
      style={[
        styles.standingRing,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    >
      {player.avatar ? (
        <Image
          source={{ uri: toAbsoluteUrl(player.avatar) }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <AvatarInitialFallback initial={initial} size={size} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: DEFAULT_SIZE + 2,
  },
  ring: {
    borderWidth: 2,
    overflow: "hidden",
    backgroundColor: "#ece8e1",
  },
  standingRing: {
    borderWidth: 1.5,
    borderColor: colors.border,
    overflow: "hidden",
    backgroundColor: "#ece8e1",
  },
  fallback: {
    backgroundColor: "#ece8e1",
    overflow: "hidden",
  },
  /** lineHeight === circle diameter centers one line; Android needs includeFontPadding: false. */
  fallbackGlyph: {
    fontWeight: "800",
    color: colors.muted,
    textAlign: "center",
    textAlignVertical: "center",
    // Optical center: cap letters still read low/right in the line box on both platforms.
    transform: [{ translateX: -1.5 }, { translateY: -2 }],
    ...Platform.select({
      android: { includeFontPadding: false },
      default: {},
    }),
  },
  plus: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.fairway,
  },
});
