import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
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
  onImagePicked?: (uri: string) => void;
  onComposerFocus?: () => void;
  onTyping?: () => void;
  replyTo?: ReplyTarget | null;
  onCancelReply?: () => void;
};

export const RoundGroupChatComposer = memo(function RoundGroupChatComposer({
  styles: s,
  sendBusy,
  onSend,
  onImagePicked,
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

  const handlePickImage = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      onImagePicked?.(result.assets[0].uri);
    }
  }, [onImagePicked]);

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
        {onImagePicked ? (
          <Pressable
            style={composerBtnStyles.plusBtn}
            onPress={() => void handlePickImage()}
            hitSlop={6}
            accessibilityLabel="Add photo"
          >
            <Ionicons name="add-circle" size={28} color={colors.fairway} />
          </Pressable>
        ) : null}
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={handleChangeText}
          onFocus={() => onComposerFocus?.()}
          placeholder="Message…"
          placeholderTextColor={colors.muted}
          style={s.input}
          multiline
          blurOnSubmit={false}
          maxLength={2000}
        />
        <Pressable
          style={[s.sendBtn, (sendBusy || !draft.trim()) && s.sendBtnDisabled]}
          onPress={() => void submit()}
          disabled={sendBusy || !draft.trim()}
          accessibilityLabel="Send message"
        >
          {sendBusy ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="arrow-up" size={20} color="#fff" />
          )}
        </Pressable>
      </View>
    </View>
  );
});

const composerBtnStyles = StyleSheet.create({
  plusBtn: {
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 2,
  },
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
