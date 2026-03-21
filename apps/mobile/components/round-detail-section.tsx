import type { ComponentProps, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../lib/theme";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

type Props = {
  title: string;
  hint?: string;
  /** Left header icon (same treatment as round “Group chat” row). */
  icon: IoniconName;
  expanded: boolean;
  onToggle: () => void;
  children?: ReactNode;
};

export function RoundDetailSection({ title, hint, icon, expanded, onToggle, children }: Props) {
  return (
    <View style={styles.card}>
      <Pressable
        style={({ pressed }) => [styles.headerPressable, pressed && styles.headerPressed]}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={expanded ? `Collapse ${title}` : `Expand ${title}`}
      >
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={22} color={colors.fairway} />
        </View>
        <View style={styles.textCol}>
          <Text style={styles.title}>{title}</Text>
          {hint ? (
            <Text style={styles.subtitle} numberOfLines={3}>
              {hint}
            </Text>
          ) : null}
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={20}
          color={colors.muted}
        />
      </Pressable>
      {expanded ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  headerPressable: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
  },
  headerPressed: { opacity: 0.92 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: colors.fairwaySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: { flex: 1, minWidth: 0, gap: 4 },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  body: {
    gap: 8,
    width: "100%",
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
