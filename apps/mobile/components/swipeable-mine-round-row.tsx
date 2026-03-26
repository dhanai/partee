import type { ComponentProps, ReactNode } from "react";
import { useCallback, useRef } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  type StyleProp,
  Text,
  type TextStyle,
  View,
} from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import Reanimated, {
  type SharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../lib/theme";

const REVEAL_W = 86;
const CIRCLE = 52;
const COMPACT_REVEAL_W = 58;
const COMPACT_CIRCLE = 32;

type Variant = "host" | "invite" | "none";

type Props = {
  variant: Variant;
  enabled: boolean;
  children: ReactNode;
  hostLeftLabel?: string;
  hostLeftIcon?: ComponentProps<typeof Ionicons>["name"];
  compact?: boolean;
  onHostDelete?: () => void;
  onHostEdit?: () => void;
  onInviteClaim?: () => void;
  onInviteDecline?: () => void;
  onSwipeActiveChange?: (active: boolean) => void;
};

type MailCircleActionProps = {
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  circleColor: string;
  iconColor: string;
  onPress: () => void;
  iconStyle?: StyleProp<TextStyle>;
  circleDiameter?: number;
  iconSize?: number;
  compactLabel?: boolean;
};

function MailCircleAction({
  icon,
  label,
  circleColor,
  iconColor,
  onPress,
  iconStyle,
  circleDiameter = CIRCLE,
  iconSize = 21,
  compactLabel = false,
}: MailCircleActionProps) {
  return (
    <Pressable
      style={[styles.mailActionCol, compactLabel && styles.mailActionColCompact]}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
    >
      <View
        style={[
          styles.mailCircle,
          {
            width: circleDiameter,
            height: circleDiameter,
            borderRadius: circleDiameter / 2,
            backgroundColor: circleColor,
          },
        ]}
      >
        <Ionicons name={icon} size={iconSize} color={iconColor} style={iconStyle} />
      </View>
      <Text style={[styles.mailActionLabel, compactLabel && styles.mailActionLabelCompact]}>
        {label}
      </Text>
    </Pressable>
  );
}

function LeftActions(
  _prog: SharedValue<number>,
  drag: SharedValue<number>,
  _methods: SwipeableMethods,
  props: {
    variant: Variant;
    compact: boolean;
    hostLeftIcon?: ComponentProps<typeof Ionicons>["name"];
    hostLeftLabel?: string;
    onPress: () => void;
  },
) {
  const revealW = props.compact ? COMPACT_REVEAL_W : REVEAL_W;
  const circleSize = props.compact ? COMPACT_CIRCLE : CIRCLE;
  const iconSize = props.compact ? 17 : 21;

  const animStyle = useAnimatedStyle(() => ({
    opacity: interpolate(drag.value, [0, 14, revealW], [0, 0.55, 1], Extrapolation.CLAMP),
  }));

  const leftIcon =
    props.variant === "host" ? (props.hostLeftIcon ?? "create-outline") : "checkmark-outline";
  const leftLabel = props.variant === "host" ? (props.hostLeftLabel ?? "Edit") : "Claim";

  return (
    <Reanimated.View style={[styles.actionContainer, { width: revealW }]}>
      <Reanimated.View style={animStyle}>
        <MailCircleAction
          icon={leftIcon}
          label={leftLabel}
          circleColor={colors.fairway}
          iconColor="#fff"
          circleDiameter={circleSize}
          iconSize={iconSize}
          compactLabel={props.compact}
          onPress={props.onPress}
          iconStyle={
            props.variant === "host" &&
            (props.hostLeftIcon == null || props.hostLeftIcon === "create-outline")
              ? styles.editPencilIconNudge
              : undefined
          }
        />
      </Reanimated.View>
    </Reanimated.View>
  );
}

function RightActions(
  _prog: SharedValue<number>,
  drag: SharedValue<number>,
  _methods: SwipeableMethods,
  props: {
    variant: Variant;
    compact: boolean;
    onPress: () => void;
  },
) {
  const revealW = props.compact ? COMPACT_REVEAL_W : REVEAL_W;
  const circleSize = props.compact ? COMPACT_CIRCLE : CIRCLE;
  const iconSize = props.compact ? 17 : 21;

  const animStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      drag.value,
      [-revealW, -14, 0],
      [1, 0.55, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const rightCircleColor = props.variant === "host" ? colors.danger : "#ddd8cf";
  const rightIcon = props.variant === "host" ? "trash-outline" : "close-outline";
  const rightIconColor = props.variant === "host" ? "#fff" : colors.text;
  const rightLabel = props.variant === "host" ? "Delete" : "Decline";

  return (
    <Reanimated.View style={[styles.actionContainer, { width: revealW }]}>
      <Reanimated.View style={animStyle}>
        <MailCircleAction
          icon={rightIcon}
          label={rightLabel}
          circleColor={rightCircleColor}
          iconColor={rightIconColor}
          circleDiameter={circleSize}
          iconSize={iconSize}
          compactLabel={props.compact}
          onPress={props.onPress}
        />
      </Reanimated.View>
    </Reanimated.View>
  );
}

export function SwipeableMineRoundRow({
  variant,
  enabled,
  children,
  hostLeftLabel,
  hostLeftIcon,
  compact = false,
  onHostDelete,
  onHostEdit,
  onInviteClaim,
  onInviteDecline,
  onSwipeActiveChange,
}: Props) {
  const swipeableRef = useRef<SwipeableMethods>(null);

  const onLeftPress = variant === "host" ? onHostEdit : onInviteClaim;
  const onRightPress = variant === "host" ? onHostDelete : onInviteDecline;

  const onLeftPressRef = useRef(onLeftPress);
  onLeftPressRef.current = onLeftPress;
  const onRightPressRef = useRef(onRightPress);
  onRightPressRef.current = onRightPress;

  const handleLeftPress = useCallback(() => {
    onLeftPressRef.current?.();
    swipeableRef.current?.close();
  }, []);

  const handleRightPress = useCallback(() => {
    onRightPressRef.current?.();
    swipeableRef.current?.close();
  }, []);

  const onSwipeActiveChangeRef = useRef(onSwipeActiveChange);
  onSwipeActiveChangeRef.current = onSwipeActiveChange;

  const handleOpenStartDrag = useCallback(() => {
    onSwipeActiveChangeRef.current?.(true);
  }, []);

  const handleClose = useCallback(() => {
    onSwipeActiveChangeRef.current?.(false);
  }, []);

  if (variant === "none" || Platform.OS === "web" || !enabled) {
    return <>{children}</>;
  }

  const revealW = compact ? COMPACT_REVEAL_W : REVEAL_W;

  return (
    <View style={[styles.swipeOuter, compact && styles.swipeOuterCompact]}>
      <ReanimatedSwipeable
        ref={swipeableRef}
        friction={2}
        leftThreshold={revealW * 0.4}
        rightThreshold={revealW * 0.4}
        overshootLeft={true}
        overshootRight={true}
        overshootFriction={5}
        onSwipeableOpenStartDrag={handleOpenStartDrag}
        onSwipeableCloseStartDrag={handleOpenStartDrag}
        onSwipeableClose={handleClose}
        renderLeftActions={(prog, drag, methods) =>
          LeftActions(prog, drag, methods, {
            variant,
            compact,
            hostLeftIcon,
            hostLeftLabel,
            onPress: handleLeftPress,
          })
        }
        renderRightActions={(prog, drag, methods) =>
          RightActions(prog, drag, methods, {
            variant,
            compact,
            onPress: handleRightPress,
          })
        }
        containerStyle={styles.foreground}
        childrenContainerStyle={styles.foreground}
      >
        {children}
      </ReanimatedSwipeable>
    </View>
  );
}

const styles = StyleSheet.create({
  swipeOuter: {
    borderRadius: 16,
    overflow: "hidden",
  },
  swipeOuterCompact: {
    borderRadius: 12,
  },
  foreground: {
    backgroundColor: colors.background,
  },
  actionContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  mailActionCol: {
    alignItems: "center",
    gap: 5,
    paddingVertical: 2,
  },
  mailActionColCompact: {
    gap: 2,
    paddingVertical: 0,
  },
  mailCircle: {
    alignItems: "center",
    justifyContent: "center",
  },
  editPencilIconNudge: {
    transform: [{ translateX: 1.25 }, { translateY: -1.25 }],
  },
  mailActionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
    letterSpacing: -0.1,
  },
  mailActionLabelCompact: {
    fontSize: 9,
    letterSpacing: -0.15,
  },
});
