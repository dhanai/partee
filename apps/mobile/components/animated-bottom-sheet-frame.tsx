import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Modal, PanResponder, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BOTTOM_SHEET_BACKDROP_COLOR,
  bottomSheetCloseAnimation,
  bottomSheetOpenAnimation,
  bottomSheetSlideDistance,
} from "../lib/bottom-sheet-presets";
import { colors } from "../lib/theme";

export type AnimatedBottomSheetFrameProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Applied to the sliding surface (radii, padding, etc.). Safe-area bottom padding is always applied last. */
  sheetStyle?: StyleProp<ViewStyle>;
  backdropAccessibilityLabel?: string;
  /** Show a drag handle at the top of the sheet. Default true. */
  dragHandle?: boolean;
};

/**
 * Standard app bottom sheet: dimmed backdrop fade + sheet slide from bottom.
 * Use this shell for new sheets; timing/colors live in `lib/bottom-sheet-presets.ts`.
 */
const DRAG_DISMISS_THRESHOLD = 80;
const DRAG_VELOCITY_DISMISS = 0.5;

export function AnimatedBottomSheetFrame({
  visible,
  onClose,
  children,
  sheetStyle,
  backdropAccessibilityLabel = "Dismiss",
  dragHandle = true,
}: AnimatedBottomSheetFrameProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 16);

  const [internalVisible, setInternalVisible] = useState(false);
  const backdropOp = useRef(new Animated.Value(0)).current;
  const sheetY = useRef(new Animated.Value(bottomSheetSlideDistance())).current;
  const draggingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
        onPanResponderGrant: () => {
          draggingRef.current = true;
          sheetY.stopAnimation();
        },
        onPanResponderMove: (_, g) => {
          const dy = Math.max(0, g.dy);
          sheetY.setValue(dy);
          const dist = bottomSheetSlideDistance();
          backdropOp.setValue(Math.max(0, 1 - dy / dist));
        },
        onPanResponderRelease: (_, g) => {
          draggingRef.current = false;
          if (g.dy > DRAG_DISMISS_THRESHOLD || g.vy > DRAG_VELOCITY_DISMISS) {
            const dist = bottomSheetSlideDistance();
            Animated.parallel([
              Animated.timing(sheetY, {
                toValue: dist,
                duration: 200,
                useNativeDriver: true,
                easing: Easing.out(Easing.cubic),
              }),
              Animated.timing(backdropOp, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
                easing: Easing.out(Easing.cubic),
              }),
            ]).start(() => {
              setInternalVisible(false);
              onCloseRef.current();
            });
          } else {
            Animated.parallel([
              Animated.timing(sheetY, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
                easing: Easing.out(Easing.cubic),
              }),
              Animated.timing(backdropOp, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
                easing: Easing.out(Easing.cubic),
              }),
            ]).start();
          }
        },
      }),
    [sheetY, backdropOp],
  );

  useEffect(() => {
    if (!visible) return;
    const dist = bottomSheetSlideDistance();
    backdropOp.stopAnimation();
    sheetY.stopAnimation();
    sheetY.setValue(dist);
    backdropOp.setValue(0);
    setInternalVisible(true);
    const id = requestAnimationFrame(() => {
      Animated.parallel([
        Animated.timing(backdropOp, {
          toValue: 1,
          duration: bottomSheetOpenAnimation.backdrop.duration,
          useNativeDriver: true,
          easing: bottomSheetOpenAnimation.backdrop.easing,
        }),
        Animated.timing(sheetY, {
          toValue: 0,
          duration: bottomSheetOpenAnimation.sheet.duration,
          useNativeDriver: true,
          easing: bottomSheetOpenAnimation.sheet.easing,
        }),
      ]).start();
    });
    return () => cancelAnimationFrame(id);
  }, [visible]);

  useEffect(() => {
    if (visible || !internalVisible) return;
    if (draggingRef.current) return;
    const dist = bottomSheetSlideDistance();
    backdropOp.stopAnimation();
    sheetY.stopAnimation();
    Animated.parallel([
      Animated.timing(backdropOp, {
        toValue: 0,
        duration: bottomSheetCloseAnimation.backdrop.duration,
        useNativeDriver: true,
        easing: bottomSheetCloseAnimation.backdrop.easing,
      }),
      Animated.timing(sheetY, {
        toValue: dist,
        duration: bottomSheetCloseAnimation.sheet.duration,
        useNativeDriver: true,
        easing: bottomSheetCloseAnimation.sheet.easing,
      }),
    ]).start(({ finished }) => {
      if (finished) setInternalVisible(false);
    });
  }, [visible, internalVisible]);

  return (
    <Modal
      visible={internalVisible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdropPress}
          onPress={onClose}
          accessibilityLabel={backdropAccessibilityLabel}
        >
          <Animated.View
            style={[styles.backdropDim, { opacity: backdropOp }]}
            pointerEvents="none"
          />
        </Pressable>
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: bottomPad },
            sheetStyle,
            { transform: [{ translateY: sheetY }] },
          ]}
        >
          {dragHandle ? (
            <View style={styles.dragHandleArea} {...panResponder.panHandlers}>
              <View style={styles.dragHandle} />
            </View>
          ) : null}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdropPress: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropDim: {
    flex: 1,
    backgroundColor: BOTTOM_SHEET_BACKDROP_COLOR,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    borderColor: colors.border,
  },
  dragHandleArea: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 6,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
});
