import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../lib/theme";

type Props = {
  title: string;
  hint?: string;
  expanded: boolean;
  onToggle: () => void;
  children?: ReactNode;
};

export function RoundDetailSection({ title, hint, expanded, onToggle, children }: Props) {
  return (
    <View style={styles.card}>
      <Pressable
        style={styles.headerRow}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={expanded ? `Collapse ${title}` : `Expand ${title}`}
      >
        <Text style={styles.sectionTitle}>{title}</Text>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={20}
          color={colors.fairway}
        />
      </Pressable>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {expanded ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 12,
    gap: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  hint: { color: colors.muted, fontSize: 12, marginTop: -4 },
  body: { gap: 8, width: "100%" },
});
