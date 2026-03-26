import React, { forwardRef } from "react";
import { KeyboardChatScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ScrollViewProps } from "react-native";
import type { KeyboardChatScrollViewProps } from "react-native-keyboard-controller";

type Ref = React.ElementRef<typeof KeyboardChatScrollView>;

/**
 * Drop-in ScrollView replacement for FlatList in chat screens.
 * Handles keyboard padding, content repositioning, and interactive
 * dismiss natively — no manual keyboard state tracking needed.
 *
 * Usage: <FlatList renderScrollComponent={renderChatScrollComponent} />
 */
const ChatScrollView = forwardRef<
  Ref,
  ScrollViewProps & KeyboardChatScrollViewProps
>((props, ref) => {
  const { bottom } = useSafeAreaInsets();
  return (
    <KeyboardChatScrollView
      ref={ref}
      automaticallyAdjustContentInsets={false}
      contentInsetAdjustmentBehavior="never"
      keyboardDismissMode="interactive"
      offset={bottom}
      {...props}
    />
  );
});

ChatScrollView.displayName = "ChatScrollView";

export default ChatScrollView;
