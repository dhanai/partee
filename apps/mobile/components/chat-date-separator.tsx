import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../lib/theme";

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (msgDay.getTime() === today.getTime()) return "Today";
  if (msgDay.getTime() === yesterday.getTime()) return "Yesterday";

  const diff = today.getTime() - msgDay.getTime();
  if (diff < 7 * 86400000) {
    return date.toLocaleDateString("en-US", { weekday: "long" });
  }

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type Props = { date: string };

export const ChatDateSeparator = memo(function ChatDateSeparator({ date }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.line} />
      <Text style={styles.label}>{formatDateLabel(date)}</Text>
      <View style={styles.line} />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 10,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
  },
});
