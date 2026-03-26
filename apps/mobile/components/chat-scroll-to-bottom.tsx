import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import { colors } from "../lib/theme";

type Props = {
  visible: boolean;
  onPress: () => void;
  unreadCount?: number;
};

export const ChatScrollToBottom = memo(function ChatScrollToBottom({
  visible,
  onPress,
  unreadCount,
}: Props) {
  if (!visible) return null;

  return (
    <Animated.View
      style={styles.container}
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(100)}
      pointerEvents="box-none"
    >
      <Pressable style={styles.button} onPress={onPress}>
        <Ionicons name="chevron-down" size={20} color={colors.text} />
      </Pressable>
      {unreadCount && unreadCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 8,
    alignSelf: "center",
    zIndex: 10,
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  badge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.fairway,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
});
