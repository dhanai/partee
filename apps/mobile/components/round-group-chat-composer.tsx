import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { ensureMediaLibraryPermissionForPicker } from "../lib/media-library-permission";
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { BlurView } from "expo-blur";
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Easing,
  Keyboard,
  LayoutAnimation,
  Platform,
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
  /** Opens GIF search (e.g. Giphy). Listed in the + attachment menu when set. */
  onGifPress?: () => void;
  onComposerFocus?: () => void;
  onTyping?: () => void;
  replyTo?: ReplyTarget | null;
  onCancelReply?: () => void;
  /** Fires when the + attachment menu opens or closes (for chat list dismiss overlay). */
  onAttachMenuOpenChange?: (open: boolean) => void;
};

export type ComposerHandle = { focus: () => void; closeAttachMenu: () => void };

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
    onAttachMenuOpenChange,
  }: Props, ref) {
  const [draft, setDraft] = useState("");
  const [stagedImages, setStagedImages] = useState<PickedImageAsset[]>([]);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const attachMenuScale = useRef(new Animated.Value(0)).current;
  const attachMenuOpenRef = useRef(false);
  attachMenuOpenRef.current = attachMenuOpen;

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

  const openImagePickerAfterMenu = useCallback(async () => {
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

  const closeAttachMenu = useCallback(
    (afterClose?: () => void) => {
      attachMenuScale.stopAnimation();
      Animated.timing(attachMenuScale, {
        toValue: 0,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) {
          setAttachMenuOpen(false);
          afterClose?.();
        }
      });
    },
    [attachMenuScale],
  );

  useImperativeHandle(
    ref,
    () => ({
      focus: () => inputRef.current?.focus(),
      closeAttachMenu: () => {
        if (attachMenuOpenRef.current) {
          closeAttachMenu();
        }
      },
    }),
    [closeAttachMenu],
  );

  useEffect(() => {
    onAttachMenuOpenChange?.(attachMenuOpen);
  }, [attachMenuOpen, onAttachMenuOpenChange]);

  const handlePickImageFromMenu = useCallback(() => {
    closeAttachMenu(() => {
      void openImagePickerAfterMenu();
    });
  }, [closeAttachMenu, openImagePickerAfterMenu]);

  const removeStaged = useCallback((index: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setStagedImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const openAttachMenu = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (attachMenuOpen) {
      closeAttachMenu();
      return;
    }
    attachMenuScale.stopAnimation();
    attachMenuScale.setValue(0);
    setAttachMenuOpen(true);
  }, [attachMenuOpen, attachMenuScale, closeAttachMenu]);

  useEffect(() => {
    if (!attachMenuOpen) return;
    attachMenuScale.stopAnimation();
    attachMenuScale.setValue(0);
    Animated.spring(attachMenuScale, {
      toValue: 1,
      friction: 9,
      tension: 280,
      useNativeDriver: false,
    }).start();
  }, [attachMenuOpen, attachMenuScale]);

  useEffect(() => {
    if (Platform.OS !== "android" || !attachMenuOpen) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      closeAttachMenu();
      return true;
    });
    return () => sub.remove();
  }, [attachMenuOpen, closeAttachMenu]);

  const handleGifFromMenu = useCallback(() => {
    Keyboard.dismiss();
    closeAttachMenu(() => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onGifPress?.();
    });
  }, [closeAttachMenu, onGifPress]);

  const ATTACH_MENU_MAX_W = 188;

  const attachMenuPopover = (
    <Animated.View
      style={[
        attachMenuStyles.sheetInline,
        {
          maxWidth: ATTACH_MENU_MAX_W,
          opacity: attachMenuScale.interpolate({
            inputRange: [0, 0.15, 1],
            outputRange: [0, 1, 1],
          }),
          transform: [{ scale: attachMenuScale }],
          transformOrigin: "0% 100%",
        },
      ]}
      pointerEvents="box-none"
    >
      <BlurView
        intensity={Platform.OS === "ios" ? 88 : 48}
        tint="light"
        style={[
          attachMenuStyles.blurChrome,
          Platform.OS === "android" ? attachMenuStyles.blurChromeAndroid : null,
        ]}
      >
        <Pressable
          style={attachMenuStyles.row}
          onPress={() => void handlePickImageFromMenu()}
          accessibilityRole="button"
          accessibilityLabel="Photo"
        >
          <View style={attachMenuStyles.iconSlot}>
            <Ionicons name="image-outline" size={22} color={colors.fairway} />
          </View>
          <Text style={attachMenuStyles.rowLabel}>Photo</Text>
        </Pressable>
        {onGifPress ? (
          <>
            <View style={attachMenuStyles.separator} />
            <Pressable
              style={attachMenuStyles.row}
              onPress={handleGifFromMenu}
              accessibilityRole="button"
              accessibilityLabel="GIF"
            >
              <View style={attachMenuStyles.iconSlot}>
                <View style={attachMenuStyles.gifBadge}>
                  <Text style={attachMenuStyles.gifBadgeText} allowFontScaling={false}>
                    GIF
                  </Text>
                </View>
              </View>
              <Text style={attachMenuStyles.rowLabel}>GIF</Text>
            </Pressable>
          </>
        ) : null}
      </BlurView>
    </Animated.View>
  );

  return (
    <>
    <View style={composerOuterStyles.root}>
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

      {/* Full-width wrapper so the attach menu is not clipped by the narrow + column */}
      <View style={composerOuterStyles.attachRowWrap} collapsable={false}>
        <View style={[s.composerRow, composerOuterStyles.composerRow]}>
          {onSendWithAttachments ? (
            <View style={composerBtnStyles.plusWrap} collapsable={false}>
              <Pressable
                onPress={openAttachMenu}
                hitSlop={6}
                accessibilityLabel="Add attachment"
                accessibilityHint="Opens photo and GIF options"
              >
                <Ionicons name="add-circle" size={28} color={colors.fairway} />
              </Pressable>
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
        {onSendWithAttachments && attachMenuOpen ? attachMenuPopover : null}
      </View>
    </View>
    </>
  );
}));

const composerOuterStyles = StyleSheet.create({
  root: {
    overflow: "visible",
    alignSelf: "stretch",
  },
  attachRowWrap: {
    position: "relative",
    width: "100%",
    overflow: "visible",
    zIndex: 1,
  },
  composerRow: {
    overflow: "visible",
  },
});

const composerBtnStyles = StyleSheet.create({
  plusWrap: {
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 2,
    alignSelf: "center",
  },
});

const attachMenuStyles = StyleSheet.create({
  sheetInline: {
    position: "absolute",
    bottom: "100%",
    left: 0,
    marginBottom: 8,
    alignSelf: "flex-start",
    borderRadius: 10,
    overflow: "hidden",
    zIndex: 1000,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 24,
  },
  blurChrome: {
    borderRadius: 10,
    overflow: "hidden",
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 10,
    paddingRight: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.72)",
  },
  blurChromeAndroid: {
    backgroundColor: "rgba(255, 255, 255, 0.82)",
  },
  iconSlot: {
    width: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  rowLabel: {
    marginLeft: 8,
    fontSize: 16,
    color: colors.text,
    fontWeight: "500",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(0, 0, 0, 0.08)",
    marginLeft: 52,
  },
  gifBadge: {
    width: 28,
    height: 20,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.fairway,
    justifyContent: "center",
    alignItems: "center",
  },
  gifBadgeText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: colors.fairway,
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
