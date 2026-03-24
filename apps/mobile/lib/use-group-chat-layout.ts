import { useEffect, useState } from "react";
import { Keyboard, LayoutAnimation, Platform, UIManager } from "react-native";
import { GROUP_CHAT_COMPOSER_GAP } from "./group-chat-layout-constants";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * Tracks keyboard height for fullscreen chat. Uses `LayoutAnimation` with the native keyboard
 * curve so padding changes animate in lock-step with the keyboard — no spring overshoot.
 *
 * Returns `keyboardPadding` — apply as `paddingBottom` on the outermost container (replaces KAV).
 * Returns `composerBottomPadding` — safe-area when closed, small gap when keyboard is open.
 */
export function useFullscreenChatKeyboard(insetsBottom: number) {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (e: { endCoordinates: { height: number }; duration: number }) => {
      if (Platform.OS === "ios") {
        LayoutAnimation.configureNext({
          duration: e.duration > 0 ? e.duration : 250,
          update: { type: LayoutAnimation.Types.keyboard },
        });
      }
      setKeyboardHeight(e.endCoordinates.height);
    };

    const onHide = (e: { duration: number }) => {
      if (Platform.OS === "ios") {
        LayoutAnimation.configureNext({
          duration: (e as any).duration > 0 ? (e as any).duration : 250,
          update: { type: LayoutAnimation.Types.keyboard },
        });
      }
      setKeyboardHeight(0);
    };

    const subShow = Keyboard.addListener(showEvent, onShow as any);
    const subHide = Keyboard.addListener(hideEvent, onHide as any);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  const keyboardOpen = keyboardHeight > 0;
  const safeBottom = Math.max(GROUP_CHAT_COMPOSER_GAP, insetsBottom);

  return {
    keyboardPadding: keyboardOpen ? keyboardHeight : 0,
    composerBottomPadding: keyboardOpen ? GROUP_CHAT_COMPOSER_GAP : safeBottom,
  };
}
