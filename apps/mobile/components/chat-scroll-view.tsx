import React, { createContext, forwardRef, useContext } from "react";
import { KeyboardChatScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ScrollViewProps } from "react-native";
import type { KeyboardChatScrollViewProps } from "react-native-keyboard-controller";

type Ref = React.ElementRef<typeof KeyboardChatScrollView>;

const MARGIN = 8;

export const ChatFreezeContext = createContext(false);

const ChatScrollView = forwardRef<
  Ref,
  ScrollViewProps & KeyboardChatScrollViewProps
>(({ inverted, ...props }, ref) => {
  const { bottom } = useSafeAreaInsets();
  const freeze = useContext(ChatFreezeContext);
  return (
    <KeyboardChatScrollView
      ref={ref}
      inverted={inverted}
      freeze={freeze}
      automaticallyAdjustContentInsets={false}
      contentInsetAdjustmentBehavior="never"
      keyboardDismissMode="interactive"
      offset={bottom - MARGIN}
      {...props}
    />
  );
});

ChatScrollView.displayName = "ChatScrollView";

export default ChatScrollView;
