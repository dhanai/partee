import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../lib/theme";

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

type Props = { date: string };

export const ChatTimestamp = memo(function ChatTimestamp({ date }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{formatTimestamp(date)}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.muted,
  },
});
