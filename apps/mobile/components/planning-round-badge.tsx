import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import {
  planningWindowTheme,
  type PlanningTimeWindow,
} from "../lib/planning-window-theme";

type Props = {
  preferredTimeWindow: PlanningTimeWindow;
  /** Tighter spacing when sitting above a headline */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function PlanningRoundBadge({ preferredTimeWindow, compact, style }: Props) {
  const t = planningWindowTheme(preferredTimeWindow);
  return (
    <View
      accessible
      accessibilityLabel="Planning"
      style={[
        styles.badge,
        compact && styles.badgeCompact,
        { backgroundColor: t.pillBg },
        style,
      ]}
    >
      <Ionicons name={t.icon} size={15} color={t.pillText} style={styles.icon} />
      <Text style={[styles.label, { color: t.pillText }]}>Planning</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    flexShrink: 0,
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
  },
  badgeCompact: {
    marginBottom: 6,
  },
  icon: {
    marginTop: 0.5,
  },
  label: {
    fontWeight: "600",
    fontSize: 13,
  },
});
