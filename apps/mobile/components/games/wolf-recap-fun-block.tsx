import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../lib/theme";

type Props = {
  highlights: string[];
};

export function WolfRecapFunBlock({ highlights }: Props) {
  if (highlights.length === 0) return null;

  return (
    <View style={styles.statsBlock}>
      <Text style={styles.sectionTitle}>Stats</Text>
      {highlights.map((line, i) => (
        <View key={i} style={styles.highlightCard}>
          <Ionicons name="sparkles" size={20} color={colors.fairway} style={styles.highlightIcon} />
          <Text style={styles.highlightText}>{line}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  statsBlock: { marginBottom: 20, gap: 10 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  highlightCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  highlightIcon: { marginTop: 2 },
  highlightText: { flex: 1, fontSize: 15, lineHeight: 22, color: colors.text, fontWeight: "600" },
});
