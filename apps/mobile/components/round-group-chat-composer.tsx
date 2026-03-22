import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { colors } from "../lib/theme";

export type GroupChatComposerStyles = {
  composerRow: ViewStyle;
  input: TextStyle;
  sendBtn: ViewStyle;
  sendBtnDisabled: ViewStyle;
};

type Props = {
  styles: GroupChatComposerStyles;
  sendBusy: boolean;
  /** Return true if the message was sent and the composer should clear. */
  onSend: (text: string) => Promise<boolean>;
  onComposerFocus?: () => void;
};

/**
 * Local draft state so each keystroke does not re-render the message list (parent).
 */
export const RoundGroupChatComposer = memo(function RoundGroupChatComposer({
  styles: s,
  sendBusy,
  onSend,
  onComposerFocus,
}: Props) {
  const [draft, setDraft] = useState("");

  const submit = useCallback(async () => {
    const text = draft.trim();
    if (!text || sendBusy) return;
    const ok = await onSend(text);
    if (ok) setDraft("");
  }, [draft, sendBusy, onSend]);

  return (
    <View style={s.composerRow}>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onFocus={() => onComposerFocus?.()}
        placeholder="Message the group…"
        placeholderTextColor={colors.muted}
        style={s.input}
        multiline
        maxLength={2000}
        editable={!sendBusy}
      />
      <Pressable
        style={[s.sendBtn, sendBusy && s.sendBtnDisabled]}
        onPress={() => void submit()}
        disabled={sendBusy || !draft.trim()}
        accessibilityLabel="Send message"
      >
        {sendBusy ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Ionicons name="send" size={18} color="#fff" />
        )}
      </Pressable>
    </View>
  );
});
