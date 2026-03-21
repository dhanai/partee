import { StyleSheet, Text, View } from "react-native";
import { colors } from "../lib/theme";

type ParfadeLogoProps = {
  compact?: boolean;
  tone?: "default" | "light";
  size?: "default" | "large";
};

export function ParfadeLogo({
  compact = false,
  tone = "default",
  size = "default",
}: ParfadeLogoProps) {
  const light = tone === "light";
  const large = size === "large";
  return (
    <View style={[styles.row, large && styles.rowLarge]}>
      <View
        style={[
          styles.dot,
          compact && styles.dotCompact,
          large && styles.dotLarge,
          light && styles.dotLight,
        ]}
      />
      <Text
        style={[
          styles.wordmark,
          compact && styles.wordmarkCompact,
          large && styles.wordmarkLarge,
          light && styles.wordmarkLight,
        ]}
      >
        Parfade
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowLarge: {
    gap: 10,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: "#c4a35a",
  },
  dotLarge: {
    width: 13,
    height: 13,
  },
  dotCompact: {
    width: 10,
    height: 10,
  },
  wordmark: {
    color: colors.fairway,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.6,
  },
  wordmarkCompact: {
    fontSize: 18,
  },
  wordmarkLarge: {
    fontSize: 24,
    letterSpacing: -0.68,
  },
  dotLight: {
    backgroundColor: colors.mustard,
  },
  wordmarkLight: {
    color: "#f4f1ea",
  },
});
