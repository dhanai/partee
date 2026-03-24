import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { colors } from "../lib/theme";

export type ReplyTarget = {
  id: string;
  body: string;
  user: { name: string };
};

export type GroupChatComposerStyles = {
  composerRow: ViewStyle;
  input: TextStyle;
  sendBtn: ViewStyle;
  sendBtnDisabled: ViewStyle;
};

type Props = {
  styles: GroupChatComposerStyles;
  sendBusy: boolean;
  onSend: (text: string) => Promise<boolean>;
  onComposerFocus?: () => void;
  onTyping?: () => void;
  replyTo?: ReplyTarget | null;
  onCancelReply?: () => void;
};

export const RoundGroupChatComposer = memo(function RoundGroupChatComposer({
  styles: s,
  sendBusy,
  onSend,
  onComposerFocus,
  onTyping,
  replyTo,
  onCancelReply,
}: Props) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (replyTo) inputRef.current?.focus();
  }, [replyTo]);

  const handleChangeText = useCallback(
    (text: string) => {
      setDraft(text);
      onTyping?.();
    },
    [onTyping],
  );

  const submit = useCallback(async () => {
    const text = draft.trim();
    if (!text || sendBusy) return;
    inputRef.current?.clear();
    setDraft("");
    const ok = await onSend(text);
    if (!ok) setDraft(text);
  }, [draft, sendBusy, onSend]);

  return (
    <View>
      {replyTo ? (
        <View style={replyStyles.banner}>
          <View style={replyStyles.bar} />
          <View style={replyStyles.textCol}>
            <Text style={replyStyles.name} numberOfLines={1}>
              Replying to {replyTo.user.name}
            </Text>
            <Text style={replyStyles.body} numberOfLines={1}>
              {replyTo.body}
            </Text>
          </View>
          <Pressable onPress={onCancelReply} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color={colors.muted} />
          </Pressable>
        </View>
      ) : null}
      <View style={s.composerRow}>
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={handleChangeText}
          onFocus={() => onComposerFocus?.()}
          placeholder="Message the group…"
          placeholderTextColor={colors.muted}
          style={s.input}
          multiline
          blurOnSubmit={false}
          maxLength={2000}
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
    </View>
  );
});

const replyStyles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "#f5f3ee",
    borderRadius: 8,
    marginBottom: 4,
  },
  bar: {
    width: 3,
    height: "100%",
    minHeight: 24,
    backgroundColor: colors.fairway,
    borderRadius: 1.5,
  },
  textCol: {
    flex: 1,
    gap: 1,
  },
  name: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.fairway,
  },
  body: {
    fontSize: 12,
    color: colors.muted,
  },
});
