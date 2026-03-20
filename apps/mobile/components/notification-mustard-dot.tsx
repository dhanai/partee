import { StyleSheet, View, type ViewStyle } from "react-native";
import { colors } from "../lib/theme";

/** Small indicator for unread-style notifications (tab bar / header). */
export function NotificationMustardDot({ style }: { style?: ViewStyle }) {
  return <View style={[styles.dot, style]} />;
}

const styles = StyleSheet.create({
  dot: {
    position: "absolute",
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.mustard,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
});
