import { memo, useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { colors } from "../lib/theme";

const DOT_SIZE = 6;
const DURATION = 1400;
const HALF = DURATION / 2;

function AnimatedDot({ offset }: { offset: number }) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    const startDelay = HALF - offset;
    opacity.value = withSequence(
      withTiming(0.3, { duration: startDelay, easing: Easing.linear }),
      withRepeat(
        withSequence(
          withTiming(1, { duration: HALF, easing: Easing.linear }),
          withTiming(0.3, { duration: HALF, easing: Easing.linear }),
        ),
        -1,
      ),
    );
  }, [offset, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[styles.dot, style]} />;
}

type Props = {
  names: string[];
};

export const TypingIndicator = memo(function TypingIndicator({ names }: Props) {
  if (names.length === 0) return null;

  const label =
    names.length === 1
      ? `${names[0]} is typing`
      : names.length === 2
        ? `${names[0]} and ${names[1]} are typing`
        : `${names[0]} and ${names.length - 1} others are typing`;

  return (
    <View style={styles.container}>
      <View style={styles.bubble}>
        <AnimatedDot offset={0} />
        <AnimatedDot offset={DURATION / 3} />
        <AnimatedDot offset={(DURATION / 3) * 2} />
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  bubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f1efea",
    borderRadius: 14,
    borderBottomLeftRadius: 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: colors.muted,
  },
  label: {
    fontSize: 12,
    color: colors.muted,
  },
});
