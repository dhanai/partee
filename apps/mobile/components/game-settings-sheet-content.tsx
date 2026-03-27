import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { colors } from "../lib/theme";
import type { GameTypeConfig } from "../lib/game-types-cache";

type SettingsField = GameTypeConfig["settingsSchema"][number];

type Props = {
  holesOptions: number[];
  holesCount: number;
  onHolesCountChange: (n: number) => void;
  settingsSchema: SettingsField[];
  settings: Record<string, unknown>;
  onSettingChange: (key: string, value: string | boolean) => void;
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function GameSettingsSheetContent({
  holesOptions,
  holesCount,
  onHolesCountChange,
  settingsSchema,
  settings,
  onSettingChange,
}: Props) {
  return (
    <View style={styles.content}>
      {holesOptions.length > 1 && (
        <>
          <Text style={styles.label}>Holes to play</Text>
          <View style={styles.chipRow}>
            {holesOptions.map((n) => (
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
        </>
      )}

      {settingsSchema.map((field) => {
        const currentValue = settings[field.key] ?? field.default;

        if (field.type === "select" && field.options) {
          return (
            <View key={field.key}>
              <Text style={styles.label}>{field.label}</Text>
              <View style={styles.chipRow}>
                {field.options.map((opt) => (
                  <Pressable
                    key={opt}
                    style={[styles.optChip, currentValue === opt && styles.optChipOn]}
                    onPress={() => onSettingChange(field.key, opt)}
                  >
                    <Text
                      style={[
                        styles.optChipText,
                        currentValue === opt && styles.optChipTextOn,
                      ]}
                    >
                      {capitalize(opt)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        }

        if (field.type === "toggle") {
          return (
            <View key={field.key} style={styles.toggleRow}>
              <Text style={styles.label}>{field.label}</Text>
              <Switch
                value={Boolean(currentValue)}
                onValueChange={(v) => onSettingChange(field.key, v)}
                trackColor={{ false: colors.border, true: colors.fairway }}
              />
            </View>
          );
        }

        return null;
      })}
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
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
