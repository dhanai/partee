import type { ComponentProps, ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  type StyleProp,
  Text,
  type TextStyle,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../lib/theme";

/** Horizontal travel to fully reveal one action column (Mail-style peek width). */
const REVEAL_W = 86;
const CIRCLE = 52;
/** Rubber-band past full open (iOS-like resistance). */
const RUBBER = 0.22;
/** Past this (position or projected), row stays open; otherwise springs to 0. */
const OPEN_COMMIT = REVEAL_W * 0.42;
const POSITION_COMMIT = REVEAL_W * 0.58;
/** px; scales gesture vx into release prediction. */
const VELOCITY_WEIGHT = 95;
/** Past this offset counts as “open”: that gesture may only close or re-open the same side. */
const OPEN_GATE = REVEAL_W * 0.35;
/** PanResponder vx above this (when closing) triggers overshoot + settle. */
const CLOSE_FLING_VX = 0.36;
/** px past 0 on a hard close, then ease back. */
const CLOSE_OVERSHOOT_MIN = 7;
const CLOSE_OVERSHOOT_MAX = 20;
/** Strong fling open: ease past full open then ease settle (mirrors close). */
const OPEN_FLING_VX = 0.38;
const OPEN_OVERSHOOT_MIN = 4;
const OPEN_OVERSHOOT_MAX = 11;
/** From neutral start, |v| must exceed this for close fling rubber-band. */
const NEUTRAL_CLOSE_V = 12;

/** Gesture handoff: list scroll vs row swipe (PanResponder + FlatList). */
const SCROLL_BIAS_MIN_DY = 5;
const SCROLL_BEATS_HORIZONTAL = 1.08;
const SWIPE_MIN_DX = 15;
const SWIPE_BEATS_VERTICAL = 1.52;

type Variant = "host" | "invite" | "none";

type Props = {
  variant: Variant;
  /** When false, renders children only (still respects `none` / web). */
  enabled: boolean;
  children: ReactNode;
  onHostDelete?: () => void;
  onHostEdit?: () => void;
  onInviteClaim?: () => void;
  onInviteDecline?: () => void;
  /** While true, parent should disable list scroll (Mail-style: one axis at a time). */
  onSwipeActiveChange?: (active: boolean) => void;
};

function rubberBand(value: number, limit: number): number {
  if (value > limit) {
    const over = value - limit;
    return limit + over * RUBBER;
  }
  if (value < -limit) {
    const over = -value - limit;
    return -limit - over * RUBBER;
  }
  return value;
}

/** Single-segment settle: same easing family as overshoot sequences. */
function easeSnapTo(
  anim: Animated.Value,
  toValue: number,
  fromApprox: number,
  onEnd?: () => void,
) {
  const dist = Math.abs(toValue - fromApprox);
  const duration = Math.min(320, Math.max(115, 72 + dist * 2.5));
  Animated.timing(anim, {
    toValue,
    duration,
    useNativeDriver: true,
    easing: Easing.out(Easing.cubic),
  }).start(() => {
    onEnd?.();
  });
}

/**
 * Fling close: optional past-0 + ease back. Fling open: optional past endpoint + ease settle.
 * Otherwise single ease snap (matches Mail-style motion, no spring bounce).
 */
function animateReleaseTarget(
  anim: Animated.Value,
  target: number,
  ctx: { start: number; v: number; vx: number },
  onEnd?: () => void,
) {
  const { start, v, vx } = ctx;

  if (target === REVEAL_W) {
    if (vx > OPEN_FLING_VX) {
      const mag = Math.min(
        OPEN_OVERSHOOT_MAX,
        Math.max(OPEN_OVERSHOOT_MIN, vx * 15),
      );
      const peak = REVEAL_W + mag;
      const outMs = Math.min(150, Math.round(88 + mag * 3));
      const backMs = Math.min(265, Math.round(168 + mag * 2.2));
      Animated.sequence([
        Animated.timing(anim, {
          toValue: peak,
          duration: outMs,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
        Animated.timing(anim, {
          toValue: REVEAL_W,
          duration: backMs,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
      ]).start(() => {
        onEnd?.();
      });
      return;
    }
    easeSnapTo(anim, REVEAL_W, v, onEnd);
    return;
  }

  if (target === -REVEAL_W) {
    if (vx < -OPEN_FLING_VX) {
      const mag = Math.min(
        OPEN_OVERSHOOT_MAX,
        Math.max(OPEN_OVERSHOOT_MIN, Math.abs(vx) * 15),
      );
      const peak = -REVEAL_W - mag;
      const outMs = Math.min(150, Math.round(88 + mag * 3));
      const backMs = Math.min(265, Math.round(168 + mag * 2.2));
      Animated.sequence([
        Animated.timing(anim, {
          toValue: peak,
          duration: outMs,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
        Animated.timing(anim, {
          toValue: -REVEAL_W,
          duration: backMs,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
      ]).start(() => {
        onEnd?.();
      });
      return;
    }
    easeSnapTo(anim, -REVEAL_W, v, onEnd);
    return;
  }

  let overshoot: number | null = null;
  const mag = Math.min(
    CLOSE_OVERSHOOT_MAX,
    Math.max(CLOSE_OVERSHOOT_MIN, Math.abs(vx) * 20),
  );

  if (
    vx < -CLOSE_FLING_VX &&
    (start > OPEN_GATE || (start >= -OPEN_GATE && v > NEUTRAL_CLOSE_V))
  ) {
    overshoot = -mag;
  } else if (
    vx > CLOSE_FLING_VX &&
    (start < -OPEN_GATE || (start <= OPEN_GATE && v < -NEUTRAL_CLOSE_V))
  ) {
    overshoot = mag;
  }

  if (overshoot == null) {
    easeSnapTo(anim, 0, v, onEnd);
    return;
  }

  const outMs = Math.round(100 + mag * 3.2);
  const backMs = Math.round(200 + mag * 2.4);

  Animated.sequence([
    Animated.timing(anim, {
      toValue: overshoot,
      duration: Math.min(155, outMs),
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic),
    }),
    Animated.timing(anim, {
      toValue: 0,
      duration: Math.min(280, backMs),
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic),
    }),
  ]).start(() => {
    onEnd?.();
  });
}

type MailCircleActionProps = {
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  circleColor: string;
  iconColor: string;
  onPress: () => void;
  /** Optical centering (e.g. pencil sits low-left in the glyph box). */
  iconStyle?: StyleProp<TextStyle>;
};

function MailCircleAction({
  icon,
  label,
  circleColor,
  iconColor,
  onPress,
  iconStyle,
}: MailCircleActionProps) {
  return (
    <Pressable
      style={styles.mailActionCol}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
    >
      <View style={[styles.mailCircle, { backgroundColor: circleColor }]}>
        <Ionicons
          name={icon}
          size={21}
          color={iconColor}
          style={iconStyle}
        />
      </View>
      <Text style={styles.mailActionLabel}>{label}</Text>
    </Pressable>
  );
}

export function SwipeableMineRoundRow({
  variant,
  enabled,
  children,
  onHostDelete,
  onHostEdit,
  onInviteClaim,
  onInviteDecline,
  onSwipeActiveChange,
}: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  /** Pan baseline: translateX at grant + gesture dx (native getValue is async — see lastTranslateXRef). */
  const startXRef = useRef(0);
  /** Last value we applied; synchronous baseline for grant before native getValue returns. */
  const lastTranslateXRef = useRef(0);
  /** Translate at grant time — rules for “started left/right open” for this gesture. */
  const gestureStartTranslateRef = useRef(0);
  const moveCountRef = useRef(0);
  const lastDxRef = useRef(0);
  const dragActiveRef = useRef(false);
  const rowPanActiveRef = useRef(false);
  /** Touch chose vertical scrolling; don’t take row swipe until next touch. */
  const verticalScrollIntentRef = useRef(false);
  const onSwipeActiveChangeRef = useRef(onSwipeActiveChange);
  onSwipeActiveChangeRef.current = onSwipeActiveChange;

  useEffect(() => {
    if (variant === "none" || Platform.OS === "web" || !enabled) {
      rowPanActiveRef.current = false;
      verticalScrollIntentRef.current = false;
      dragActiveRef.current = false;
      lastTranslateXRef.current = 0;
      translateX.setValue(0);
      onSwipeActiveChangeRef.current?.(false);
    }
  }, [variant, enabled, translateX]);

  /**
   * Run the action immediately, then close the row in parallel. Waiting for the close
   * animation before `router.push` / modal made taps feel dead on device and encouraged
   * multi-tap → duplicate screens / stacked alerts.
   */
  const invokeThenCloseRow = (fn?: () => void) => {
    fn?.();
    translateX.stopAnimation((current) => {
      easeSnapTo(translateX, 0, current, () => {
        lastTranslateXRef.current = 0;
      });
    });
  };

  const peek = 14;
  const leftOpacity = translateX.interpolate({
    inputRange: [0, peek, REVEAL_W],
    outputRange: [0, 0.55, 1],
    extrapolate: "clamp",
  });

  const rightOpacity = translateX.interpolate({
    inputRange: [-REVEAL_W, -peek, 0],
    outputRange: [1, 0.55, 0],
    extrapolate: "clamp",
  });

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => {
          verticalScrollIntentRef.current = false;
          rowPanActiveRef.current = false;
          return false;
        },
        onMoveShouldSetPanResponder: (_, g) => {
          if (rowPanActiveRef.current) return true;
          if (verticalScrollIntentRef.current) return false;

          const ax = Math.abs(g.dx);
          const ay = Math.abs(g.dy);

          if (ay > SCROLL_BIAS_MIN_DY && ay > ax * SCROLL_BEATS_HORIZONTAL) {
            verticalScrollIntentRef.current = true;
            return false;
          }

          if (ax > SWIPE_MIN_DX && ax > ay * SWIPE_BEATS_VERTICAL) {
            rowPanActiveRef.current = true;
            return true;
          }
          return false;
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          rowPanActiveRef.current = true;
          dragActiveRef.current = true;
          moveCountRef.current = 0;
          lastDxRef.current = 0;
          gestureStartTranslateRef.current = lastTranslateXRef.current;
          startXRef.current = lastTranslateXRef.current;
          onSwipeActiveChangeRef.current?.(true);
          translateX.stopAnimation((v) => {
            // Callback can arrive after release; never clobber ref / baseline mid-settle.
            if (!dragActiveRef.current) return;
            lastTranslateXRef.current = v;
            if (moveCountRef.current > 1) return;
            startXRef.current = v;
            const origin = gestureStartTranslateRef.current;
            let raw = v + lastDxRef.current;
            if (origin > OPEN_GATE) {
              raw = Math.max(0, raw);
            } else if (origin < -OPEN_GATE) {
              raw = Math.min(0, raw);
            }
            const next = rubberBand(raw, REVEAL_W);
            translateX.setValue(next);
            lastTranslateXRef.current = next;
          });
        },
        onPanResponderMove: (_, g) => {
          moveCountRef.current += 1;
          lastDxRef.current = g.dx;
          const origin = gestureStartTranslateRef.current;
          let raw = startXRef.current + g.dx;
          if (origin > OPEN_GATE) {
            raw = Math.max(0, raw);
          } else if (origin < -OPEN_GATE) {
            raw = Math.min(0, raw);
          }
          const next = rubberBand(raw, REVEAL_W);
          translateX.setValue(next);
          lastTranslateXRef.current = next;
        },
        onPanResponderRelease: (_, g) => {
          dragActiveRef.current = false;
          const gestureStart = gestureStartTranslateRef.current;
          let raw = startXRef.current + g.dx;
          if (gestureStart > OPEN_GATE) {
            raw = Math.max(0, raw);
          } else if (gestureStart < -OPEN_GATE) {
            raw = Math.min(0, raw);
          }

          const v = rubberBand(raw, REVEAL_W);
          lastTranslateXRef.current = v;
          const vx = g.vx;
          const projected = v + vx * VELOCITY_WEIGHT;

          let target = 0;
          if (gestureStart > OPEN_GATE) {
            if (projected > OPEN_COMMIT || v > POSITION_COMMIT) {
              target = REVEAL_W;
            } else {
              target = 0;
            }
          } else if (gestureStart < -OPEN_GATE) {
            if (projected < -OPEN_COMMIT || v < -POSITION_COMMIT) {
              target = -REVEAL_W;
            } else {
              target = 0;
            }
          } else {
            if (projected > OPEN_COMMIT || v > POSITION_COMMIT) {
              target = REVEAL_W;
            } else if (projected < -OPEN_COMMIT || v < -POSITION_COMMIT) {
              target = -REVEAL_W;
            } else {
              target = 0;
            }
          }

          rowPanActiveRef.current = false;
          verticalScrollIntentRef.current = false;
          animateReleaseTarget(translateX, target, { start: gestureStart, v, vx }, () => {
            lastTranslateXRef.current = target;
            onSwipeActiveChangeRef.current?.(false);
          });
        },
        onPanResponderTerminate: () => {
          dragActiveRef.current = false;
          rowPanActiveRef.current = false;
          verticalScrollIntentRef.current = false;
          translateX.stopAnimation((current) => {
            easeSnapTo(translateX, 0, current, () => {
              lastTranslateXRef.current = 0;
              onSwipeActiveChangeRef.current?.(false);
            });
          });
        },
      }),
    [translateX],
  );

  if (variant === "none" || Platform.OS === "web" || !enabled) {
    return <>{children}</>;
  }

  const onLeftPress = variant === "host" ? onHostDelete : onInviteClaim;
  const onRightPress = variant === "host" ? onHostEdit : onInviteDecline;

  const leftCircleColor = variant === "host" ? colors.danger : colors.fairway;
  const leftIcon = variant === "host" ? "trash-outline" : "checkmark-outline";
  const leftLabel = variant === "host" ? "Delete" : "Claim";

  const rightCircleColor = variant === "host" ? colors.fairway : "#ddd8cf";
  const rightIcon = variant === "host" ? "create-outline" : "close-outline";
  const rightIconColor = variant === "host" ? "#fff" : colors.text;
  const rightLabel = variant === "host" ? "Edit" : "Decline";

  return (
    <View style={styles.swipeOuter}>
      <View style={styles.underlay} pointerEvents="box-none">
        <View style={styles.leftRail}>
          <Animated.View style={{ opacity: leftOpacity }}>
            <MailCircleAction
              icon={leftIcon}
              label={leftLabel}
              circleColor={leftCircleColor}
              iconColor="#fff"
              onPress={() => invokeThenCloseRow(onLeftPress)}
            />
          </Animated.View>
        </View>
        <View style={styles.underlaySpacer} />
        <View style={styles.rightRail}>
          <Animated.View style={{ opacity: rightOpacity }}>
            <MailCircleAction
              icon={rightIcon}
              label={rightLabel}
              circleColor={rightCircleColor}
              iconColor={rightIconColor}
              onPress={() => invokeThenCloseRow(onRightPress)}
              iconStyle={
                variant === "host" ? styles.editPencilIconNudge : undefined
              }
            />
          </Animated.View>
        </View>
      </View>
      <Animated.View
        style={[styles.foreground, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  swipeOuter: {
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
  },
  underlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.background,
    paddingHorizontal: 10,
  },
  underlaySpacer: {
    flex: 1,
  },
  leftRail: {
    minWidth: CIRCLE + 4,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  rightRail: {
    minWidth: CIRCLE + 4,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  foreground: {
    backgroundColor: colors.background,
  },
  mailActionCol: {
    alignItems: "center",
    gap: 5,
    paddingVertical: 2,
  },
  mailCircle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  /** create-outline reads visually low/left inside the circle. */
  editPencilIconNudge: {
    transform: [{ translateX: 1.25 }, { translateY: -1.25 }],
  },
  mailActionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
    letterSpacing: -0.1,
  },
});
