import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Animated, Modal, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
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
};

/**
 * Standard app bottom sheet: dimmed backdrop fade + sheet slide from bottom.
 * Use this shell for new sheets; timing/colors live in `lib/bottom-sheet-presets.ts`.
 */
export function AnimatedBottomSheetFrame({
  visible,
  onClose,
  children,
  sheetStyle,
  backdropAccessibilityLabel = "Dismiss",
}: AnimatedBottomSheetFrameProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 16);

  const [internalVisible, setInternalVisible] = useState(false);
  const backdropOp = useRef(new Animated.Value(0)).current;
  const sheetY = useRef(new Animated.Value(bottomSheetSlideDistance())).current;

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
            sheetStyle,
            { paddingBottom: bottomPad, transform: [{ translateY: sheetY }] },
          ]}
        >
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
    paddingTop: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    borderColor: colors.border,
  },
});
