import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../lib/theme";

type Props = {
  gameType: string;
  holesCount: 9 | 18;
  onHolesCountChange: (n: 9 | 18) => void;
  skinsTieHandling: "carry" | "wash";
  onSkinsTieHandlingChange: (v: "carry" | "wash") => void;
  wolfTeeOff: "first" | "last";
  onWolfTeeOffChange: (v: "first" | "last") => void;
  wolfTieHandling: "carry" | "wash";
  onWolfTieHandlingChange: (v: "carry" | "wash") => void;
};

export function GameSettingsSheetContent({
  gameType,
  holesCount,
  onHolesCountChange,
  skinsTieHandling,
  onSkinsTieHandlingChange,
  wolfTeeOff,
  onWolfTeeOffChange,
  wolfTieHandling,
  onWolfTieHandlingChange,
}: Props) {
  if (gameType !== "skins" && gameType !== "wolf") return null;

  return (
    <View style={styles.content}>
      <Text style={styles.label}>Holes to play</Text>
      <View style={styles.chipRow}>
        {([9, 18] as const).map((n) => (
          <Pressable
            key={n}
            style={[styles.optChip, holesCount === n && styles.optChipOn]}
            onPress={() => onHolesCountChange(n)}
          >
            <Text style={[styles.optChipText, holesCount === n && styles.optChipTextOn]}>
              {n}
            </Text>
          </Pressable>
        ))}
      </View>

      {gameType === "skins" ? (
        <>
          <Text style={styles.label}>If the hole ties</Text>
          <View style={styles.chipRow}>
            {([["carry", "Carry"], ["wash", "Wash"]] as const).map(([v, label]) => (
              <Pressable
                key={v}
                style={[styles.optChip, skinsTieHandling === v && styles.optChipOn]}
                onPress={() => onSkinsTieHandlingChange(v)}
              >
                <Text style={[styles.optChipText, skinsTieHandling === v && styles.optChipTextOn]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {gameType === "wolf" ? (
        <>
          <Text style={styles.label}>Wolf tees</Text>
          <View style={styles.chipRow}>
            {([["first", "Wolf first"], ["last", "Wolf last"]] as const).map(([v, label]) => (
              <Pressable
                key={v}
                style={[styles.optChip, wolfTeeOff === v && styles.optChipOn]}
                onPress={() => onWolfTeeOffChange(v)}
              >
                <Text style={[styles.optChipText, wolfTeeOff === v && styles.optChipTextOn]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>If the hole ties</Text>
          <View style={styles.chipRow}>
            {([["carry", "Carry"], ["wash", "Wash"]] as const).map(([v, label]) => (
              <Pressable
                key={v}
                style={[styles.optChip, wolfTieHandling === v && styles.optChipOn]}
                onPress={() => onWolfTieHandlingChange(v)}
              >
                <Text style={[styles.optChipText, wolfTieHandling === v && styles.optChipTextOn]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

export const gameSettingsSheetStyles = StyleSheet.create({
  sheet: { paddingHorizontal: 16, paddingTop: 8 },
  title: { fontSize: 20, fontWeight: "800", color: colors.text, marginBottom: 14 },
});

const styles = StyleSheet.create({
  content: { gap: 12, paddingBottom: 16 },
  label: { fontSize: 14, fontWeight: "700", color: colors.text },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  optChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  optChipOn: { borderColor: colors.fairway, backgroundColor: colors.fairwaySoft },
  optChipText: { fontSize: 14, fontWeight: "600", color: colors.text },
  optChipTextOn: { color: colors.fairway },
});
