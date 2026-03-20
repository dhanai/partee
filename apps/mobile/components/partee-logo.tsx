import { StyleSheet, Text, View } from "react-native";
import { colors } from "../lib/theme";

type ParteeLogoProps = {
  compact?: boolean;
};

export function ParteeLogo({ compact = false }: ParteeLogoProps) {
  return (
    <View style={styles.row}>
      <View style={[styles.dot, compact && styles.dotCompact]} />
      <Text style={[styles.wordmark, compact && styles.wordmarkCompact]}>Partee</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: "#c4a35a",
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
});
