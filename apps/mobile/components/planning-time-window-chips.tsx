import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { planningWindowTheme } from "../lib/planning-window-theme";
import { colors } from "../lib/theme";

const SLOTS = [
  { value: "morning" as const, label: "Morning" },
  { value: "afternoon" as const, label: "Afternoon" },
  { value: "twilight" as const, label: "Twilight" },
];

export type PlanningTimeWindowChoice = (typeof SLOTS)[number]["value"];

type Props = {
  value: PlanningTimeWindowChoice;
  onChange: (value: PlanningTimeWindowChoice) => void;
};

export function PlanningTimeWindowChips({ value, onChange }: Props) {
  return (
    <View style={styles.row}>
      {SLOTS.map((slot) => {
        const t = planningWindowTheme(slot.value);
        const selected = value === slot.value;
        return (
          <Pressable
            key={slot.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[
              styles.chip,
              selected
                ? { backgroundColor: t.pillBg, borderColor: t.card.borderColor }
                : styles.chipIdle,
            ]}
            onPress={() => onChange(slot.value)}
          >
            <Ionicons
              name={t.icon}
              size={17}
              color={selected ? t.pillText : colors.muted}
            />
            <Text
              style={[styles.chipLabel, { color: selected ? t.pillText : colors.muted }]}
              numberOfLines={1}
            >
              {slot.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
  },
  chip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  chipIdle: {
    backgroundColor: "#f1efea",
    borderColor: colors.border,
  },
  chipLabel: {
    fontWeight: "600",
    fontSize: 13,
  },
});
