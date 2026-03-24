import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Keyboard, LayoutChangeEvent, Platform, type ScrollView } from "react-native";

/**
 * Fullscreen group chat: KeyboardStickyView uses translateY (no layout shrink), so the message
 * list needs bottom padding that matches the composer + safe area. Also scroll to end when the
 * keyboard opens or the composer is focused so the latest bubble stays visible.
 */
export function useGroupChatLayout(
  isFullscreen: boolean,
  scrollRef: RefObject<ScrollView | null>,
  insetsBottom: number,
  onComposerFocusProp?: () => void,
) {
  const [composerHeight, setComposerHeight] = useState(56);
  const prevComposerHeightRef = useRef(56);

  const onComposerLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const h = e.nativeEvent.layout.height;
      if (h <= 0) return;
      if (isFullscreen && h > prevComposerHeightRef.current) {
        prevComposerHeightRef.current = h;
        requestAnimationFrame(() => {
          scrollRef.current?.scrollToEnd({ animated: true });
        });
      } else {
        prevComposerHeightRef.current = h;
      }
      setComposerHeight(h);
    },
    [isFullscreen, scrollRef],
  );

  const scrollToEndAnimated = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, [scrollRef]);

  const onComposerFocus = useCallback(() => {
    scrollToEndAnimated();
    onComposerFocusProp?.();
  }, [onComposerFocusProp, scrollToEndAnimated]);

  useEffect(() => {
    if (!isFullscreen) return;
    const event = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const sub = Keyboard.addListener(event, scrollToEndAnimated);
    return () => sub.remove();
  }, [isFullscreen, scrollToEndAnimated]);

  const safeBottom = Math.max(12, insetsBottom);

  const messageListPaddingBottom = useMemo(() => {
    if (isFullscreen) {
      return composerHeight + safeBottom + 12;
    }
    return 12;
  }, [composerHeight, isFullscreen, safeBottom]);

  const stickyKeyboardOffset = useMemo(
    () => ({ closed: 0 as const, opened: 8 as const }),
    [],
  );

  const stickyWrapStyle = useMemo(
    () => ({ paddingBottom: isFullscreen ? safeBottom : 0 }),
    [isFullscreen, safeBottom],
  );

  return {
    messageListPaddingBottom,
    onComposerLayout,
    onComposerFocus,
    stickyKeyboardOffset,
    stickyWrapStyle,
  };
}
