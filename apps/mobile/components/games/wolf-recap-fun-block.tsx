import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../lib/theme";

type Props = {
  highlights: string[];
  holesLogged: number;
  tieHoles: number;
};

export function WolfRecapFunBlock({ highlights, holesLogged, tieHoles }: Props) {
  return (
    <>
      {highlights.length > 0 ? (
        <View style={styles.highlightsBlock}>
          <Text style={styles.sectionTitle}>Highlights</Text>
          {highlights.map((line, i) => (
            <View key={i} style={styles.highlightCard}>
              <Ionicons name="sparkles" size={20} color={colors.fairway} style={styles.highlightIcon} />
              <Text style={styles.highlightText}>{line}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.wolfStats}>
        <Text style={styles.sectionTitle}>Wolf snapshot</Text>
        <View style={styles.statRow}>
          <View style={styles.statChip}>
            <Text style={styles.statNum}>1</Text>
            <Text style={styles.statLabel}>game</Text>
          </View>
          <View style={styles.statChip}>
            <Text style={styles.statNum}>{holesLogged}</Text>
            <Text style={styles.statLabel}>holes logged</Text>
          </View>
        </View>
        {tieHoles > 0 ? (
          <View style={styles.statRow}>
            <View style={styles.statChipWide}>
              <Text style={styles.statEm}>{tieHoles}</Text>
              <Text style={styles.statLabel}>split holes (no wolf points)</Text>
            </View>
          </View>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  highlightsBlock: { marginBottom: 20, gap: 10 },
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
  wolfStats: { marginBottom: 20 },
  statRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  statChip: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
  },
  statChipWide: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
  },
  statNum: { fontSize: 22, fontWeight: "800", color: colors.text },
  statLabel: { fontSize: 11, fontWeight: "700", color: colors.muted, marginTop: 4, textTransform: "uppercase" },
  statEm: { fontSize: 16, fontWeight: "800", color: colors.text, textAlign: "center" },
});
