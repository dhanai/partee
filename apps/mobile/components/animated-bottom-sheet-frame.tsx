import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../lib/theme";

export {
  BottomSheetScrollView,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";

export type AnimatedBottomSheetFrameProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Applied to the inner BottomSheetView content wrapper. */
  sheetStyle?: StyleProp<ViewStyle>;
  /** Override the sheet background (radius, color, border). */
  backgroundStyle?: StyleProp<ViewStyle>;
  backdropAccessibilityLabel?: string;
  /** Show a drag indicator at the top of the sheet. Default true. */
  dragHandle?: boolean;
  /** Fixed snap points (e.g. ['50%', '90%']). When omitted, sheet sizes dynamically to content. */
  snapPoints?: readonly (string | number)[];
  /** Cap for dynamic sizing (pixels). Only used when snapPoints is omitted. */
  maxDynamicContentSize?: number;
  /** How the sheet reacts to the keyboard. Only effective with snapPoints. */
  keyboardBehavior?: "interactive" | "extend" | "fillParent";
  /** What happens when the keyboard is dismissed. Only effective with snapPoints. */
  keyboardBlurBehavior?: "none" | "restore";
  /** Android: how the window resizes when the keyboard opens (passed through to BottomSheetModal). */
  androidKeyboardInputMode?: "adjustResize" | "adjustPan";
  /**
   * Inset from the top of the container for snap math (safe area). Keeps percentage detents from
   * sitting under the status bar / notch.
   */
  topInset?: number;
  /** Allow dragging the sheet closed from the content area. Default true. Set false for scrollable sheets. */
  enableContentPanningGesture?: boolean;
};

/**
 * Standard app bottom sheet backed by @gorhom/bottom-sheet.
 *
 * For **content-sized** sheets (menus, small forms) omit `snapPoints` —
 * the sheet measures its children automatically.
 *
 * For **fixed-height** or **keyboard-interactive** sheets pass `snapPoints`
 * and use `BottomSheetScrollView` / `BottomSheetTextInput` as children.
 */
export function AnimatedBottomSheetFrame({
  visible,
  onClose,
  children,
  sheetStyle,
  backgroundStyle: bgOverride,
  backdropAccessibilityLabel: _label,
  dragHandle = true,
  snapPoints,
  maxDynamicContentSize,
  keyboardBehavior,
  keyboardBlurBehavior,
  androidKeyboardInputMode,
  topInset,
  enableContentPanningGesture = true,
}: AnimatedBottomSheetFrameProps) {
  const ref = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 16);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const programmaticRef = useRef(false);

  useEffect(() => {
    if (visible) {
      programmaticRef.current = false;
      ref.current?.present();
    } else {
      programmaticRef.current = true;
      ref.current?.dismiss();
    }
  }, [visible]);

  useEffect(
    () => () => {
      ref.current?.dismiss();
    },
    [],
  );

  const handleDismiss = useCallback(() => {
    if (!programmaticRef.current) {
      onCloseRef.current();
    }
    programmaticRef.current = false;
  }, []);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.42}
        pressBehavior="close"
      />
    ),
    [],
  );

  const useDynamic = !snapPoints || snapPoints.length === 0;

  return (
    <BottomSheetModal
      ref={ref}
      index={0}
      snapPoints={useDynamic ? undefined : [...snapPoints!]}
      topInset={topInset}
      enableDynamicSizing={useDynamic}
      maxDynamicContentSize={maxDynamicContentSize}
      enablePanDownToClose
      enableContentPanningGesture={enableContentPanningGesture}
      stackBehavior="push"
      backdropComponent={renderBackdrop}
      onDismiss={handleDismiss}
      handleComponent={dragHandle ? undefined : null}
      handleIndicatorStyle={dragHandle ? styles.indicator : undefined}
      backgroundStyle={[styles.background, bgOverride]}
      keyboardBehavior={keyboardBehavior}
      keyboardBlurBehavior={keyboardBlurBehavior}
      android_keyboardInputMode={androidKeyboardInputMode}
    >
      {useDynamic ? (
        <BottomSheetView
          style={[{ paddingBottom: bottomPad }, sheetStyle]}
        >
          {children}
        </BottomSheetView>
      ) : (
        <View style={[{ flex: 1, paddingBottom: bottomPad }, sheetStyle]}>
          {children}
        </View>
      )}
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  background: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    borderColor: colors.border,
  },
  indicator: {
    backgroundColor: colors.border,
    width: 36,
    height: 4,
  },
});
