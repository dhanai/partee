import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { ensureMediaLibraryPermissionForPicker } from "../lib/media-library-permission";
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  ActivityIndicator,
  LayoutAnimation,
  Pressable,
  ScrollView,
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

export type PickedImageAsset = {
  uri: string;
  width?: number;
  height?: number;
};

type Props = {
  styles: GroupChatComposerStyles;
  sendBusy: boolean;
  onSend: (text: string) => Promise<boolean>;
  onSendWithAttachments?: (text: string, assets: PickedImageAsset[]) => Promise<boolean>;
  /** Opens GIF search (e.g. Giphy). Shown next to the photo button when set. */
  onGifPress?: () => void;
  onComposerFocus?: () => void;
  onTyping?: () => void;
  replyTo?: ReplyTarget | null;
  onCancelReply?: () => void;
};

export type ComposerHandle = { focus: () => void };

const MAX_STAGED = 5;

export const RoundGroupChatComposer = memo(forwardRef<ComposerHandle, Props>(
  function RoundGroupChatComposer({
    styles: s,
    sendBusy,
    onSend,
    onSendWithAttachments,
    onGifPress,
    onComposerFocus,
    onTyping,
    replyTo,
    onCancelReply,
  }: Props, ref) {
  const [draft, setDraft] = useState("");
  const [stagedImages, setStagedImages] = useState<PickedImageAsset[]>([]);
  const inputRef = useRef<TextInput>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const stagedRef = useRef(stagedImages);
  stagedRef.current = stagedImages;
  const busyRef = useRef(sendBusy);
  busyRef.current = sendBusy;

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

  const hasText = draft.trim().length > 0;
  const hasImages = stagedImages.length > 0;
  const canSend = !sendBusy && (hasText || hasImages);

  const submit = useCallback(async () => {
    const text = draftRef.current.trim();
    const images = [...stagedRef.current];
    if (busyRef.current) return;
    if (!text && images.length === 0) return;

    if (images.length > 0 && onSendWithAttachments) {
      inputRef.current?.clear();
      setDraft("");
      setStagedImages([]);
      const ok = await onSendWithAttachments(text, images);
      if (!ok) {
        setDraft(text);
        setStagedImages(images);
      }
    } else if (text) {
      inputRef.current?.clear();
      setDraft("");
      const ok = await onSend(text);
      if (!ok) setDraft(text);
    }
  }, [onSend, onSendWithAttachments]);

  const handleContentSizeChange = useCallback(() => {
    LayoutAnimation.configureNext({
      duration: 100,
      update: { type: LayoutAnimation.Types.easeInEaseOut },
    });
  }, []);

  const handlePickImage = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const ok = await ensureMediaLibraryPermissionForPicker({
      title: "Permission required",
      message: "Photo library access is needed to send images in chat.",
    });
    if (!ok) return;
    const remaining = MAX_STAGED - stagedRef.current.length;
    if (remaining <= 0) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets.length > 0) {
      const newAssets = result.assets
        .slice(0, remaining)
        .map((a) => ({ uri: a.uri, width: a.width, height: a.height }));
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setStagedImages((prev) => [...prev, ...newAssets]);
    }
  }, []);

  const removeStaged = useCallback((index: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setStagedImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

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

      {hasImages ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={thumbStyles.strip}
          contentContainerStyle={thumbStyles.stripContent}
          keyboardShouldPersistTaps="always"
        >
          {stagedImages.map((img, i) => (
            <View key={img.uri + i} style={thumbStyles.thumbWrap}>
              <Image
                source={img.uri}
                style={thumbStyles.thumb}
                contentFit="cover"
                transition={150}
              />
              <Pressable
                style={thumbStyles.removeBtn}
                onPress={() => removeStaged(i)}
                hitSlop={4}
              >
                <Ionicons name="close-circle" size={18} color="#fff" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <View style={s.composerRow}>
        {onSendWithAttachments ? (
          <View style={composerBtnStyles.leftActions}>
            <Pressable
              style={composerBtnStyles.plusBtn}
              onPress={() => void handlePickImage()}
              hitSlop={6}
              accessibilityLabel="Add photo"
            >
              <Ionicons name="add-circle" size={28} color={colors.fairway} />
            </Pressable>
            {onGifPress ? (
              <Pressable
                style={composerBtnStyles.plusBtn}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onGifPress();
                }}
                hitSlop={6}
                accessibilityLabel="Add GIF"
              >
                <Ionicons name="film-outline" size={26} color={colors.fairway} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={handleChangeText}
          onContentSizeChange={handleContentSizeChange}
          onFocus={() => onComposerFocus?.()}
          placeholder="Message…"
          placeholderTextColor={colors.muted}
          style={s.input}
          multiline
          blurOnSubmit={false}
          maxLength={2000}
        />
        <Pressable
          style={[s.sendBtn, !canSend && s.sendBtnDisabled]}
          onPress={() => void submit()}
          disabled={!canSend}
          hitSlop={8}
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
}));

const composerBtnStyles = StyleSheet.create({
  leftActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  plusBtn: {
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 2,
  },
});

const thumbStyles = StyleSheet.create({
  strip: {
    maxHeight: 72,
    marginBottom: 4,
  },
  stripContent: {
    paddingHorizontal: 8,
    gap: 8,
  },
  thumbWrap: {
    width: 56,
    height: 56,
    borderRadius: 10,
    overflow: "hidden",
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
  },
  removeBtn: {
    position: "absolute",
    top: 2,
    right: 2,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 9,
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
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
