import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Image as ExpoImage } from "expo-image";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  Image,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Autolink from "react-native-autolink";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { toAbsoluteUrl } from "../lib/api";
import { getImageUrls } from "../lib/attachment-types";
import type { GroupStyle } from "../lib/chat-group-styles";
import { colors } from "../lib/theme";
import { type ChatMessage, chatBubbleStyles as legacyStyles } from "../lib/chat-styles";
import { AnimatedBottomSheetFrame } from "./animated-bottom-sheet-frame";

const MOSAIC_MAX_W = 240;
const MOSAIC_GAP = 2;

function ImageMosaic({
  urls,
  radii,
  onPress,
}: {
  urls: string[];
  radii: { borderTopLeftRadius: number; borderTopRightRadius: number; borderBottomLeftRadius: number; borderBottomRightRadius: number };
  onPress?: (index: number) => void;
}) {
  const count = urls.length;

  if (count === 1) {
    return (
      <Pressable onPress={() => onPress?.(0)} style={[mosaicStyles.single, radii]}>
        <ExpoImage source={toAbsoluteUrl(urls[0])} style={[mosaicStyles.singleImg, radii]} contentFit="cover" transition={200} />
      </Pressable>
    );
  }

  if (count === 2) {
    const cellW = (MOSAIC_MAX_W - MOSAIC_GAP) / 2;
    return (
      <View style={[mosaicStyles.row, { width: MOSAIC_MAX_W }, radii, { overflow: "hidden" }]}>
        <Pressable onPress={() => onPress?.(0)} style={{ width: cellW, height: cellW }}>
          <ExpoImage source={toAbsoluteUrl(urls[0])} style={{ width: cellW, height: cellW }} contentFit="cover" transition={200} />
        </Pressable>
        <View style={{ width: MOSAIC_GAP }} />
        <Pressable onPress={() => onPress?.(1)} style={{ width: cellW, height: cellW }}>
          <ExpoImage source={toAbsoluteUrl(urls[1])} style={{ width: cellW, height: cellW }} contentFit="cover" transition={200} />
        </Pressable>
      </View>
    );
  }

  if (count === 3) {
    const leftW = Math.round(MOSAIC_MAX_W * 0.66);
    const rightW = MOSAIC_MAX_W - leftW - MOSAIC_GAP;
    const h = leftW;
    const halfH = (h - MOSAIC_GAP) / 2;
    return (
      <View style={[mosaicStyles.row, { width: MOSAIC_MAX_W, height: h }, radii, { overflow: "hidden" }]}>
        <Pressable onPress={() => onPress?.(0)} style={{ width: leftW, height: h }}>
          <ExpoImage source={toAbsoluteUrl(urls[0])} style={{ width: leftW, height: h }} contentFit="cover" transition={200} />
        </Pressable>
        <View style={{ width: MOSAIC_GAP }} />
        <View style={{ width: rightW, height: h, justifyContent: "space-between" }}>
          <Pressable onPress={() => onPress?.(1)} style={{ width: rightW, height: halfH }}>
            <ExpoImage source={toAbsoluteUrl(urls[1])} style={{ width: rightW, height: halfH }} contentFit="cover" transition={200} />
          </Pressable>
          <Pressable onPress={() => onPress?.(2)} style={{ width: rightW, height: halfH }}>
            <ExpoImage source={toAbsoluteUrl(urls[2])} style={{ width: rightW, height: halfH }} contentFit="cover" transition={200} />
          </Pressable>
        </View>
      </View>
    );
  }

  if (count === 4) {
    const cellW = (MOSAIC_MAX_W - MOSAIC_GAP) / 2;
    return (
      <View style={[{ width: MOSAIC_MAX_W }, radii, { overflow: "hidden" }]}>
        <View style={mosaicStyles.row}>
          <Pressable onPress={() => onPress?.(0)} style={{ width: cellW, height: cellW }}>
            <ExpoImage source={toAbsoluteUrl(urls[0])} style={{ width: cellW, height: cellW }} contentFit="cover" transition={200} />
          </Pressable>
          <View style={{ width: MOSAIC_GAP }} />
          <Pressable onPress={() => onPress?.(1)} style={{ width: cellW, height: cellW }}>
            <ExpoImage source={toAbsoluteUrl(urls[1])} style={{ width: cellW, height: cellW }} contentFit="cover" transition={200} />
          </Pressable>
        </View>
        <View style={{ height: MOSAIC_GAP }} />
        <View style={mosaicStyles.row}>
          <Pressable onPress={() => onPress?.(2)} style={{ width: cellW, height: cellW }}>
            <ExpoImage source={toAbsoluteUrl(urls[2])} style={{ width: cellW, height: cellW }} contentFit="cover" transition={200} />
          </Pressable>
          <View style={{ width: MOSAIC_GAP }} />
          <Pressable onPress={() => onPress?.(3)} style={{ width: cellW, height: cellW }}>
            <ExpoImage source={toAbsoluteUrl(urls[3])} style={{ width: cellW, height: cellW }} contentFit="cover" transition={200} />
          </Pressable>
        </View>
      </View>
    );
  }

  // 5 images: 2 on top, 3 on bottom
  const topCellW = (MOSAIC_MAX_W - MOSAIC_GAP) / 2;
  const botCellW = (MOSAIC_MAX_W - MOSAIC_GAP * 2) / 3;
  const cellH = topCellW * 0.75;
  return (
    <View style={[{ width: MOSAIC_MAX_W }, radii, { overflow: "hidden" }]}>
      <View style={mosaicStyles.row}>
        <Pressable onPress={() => onPress?.(0)} style={{ width: topCellW, height: cellH }}>
          <ExpoImage source={toAbsoluteUrl(urls[0])} style={{ width: topCellW, height: cellH }} contentFit="cover" transition={200} />
        </Pressable>
        <View style={{ width: MOSAIC_GAP }} />
        <Pressable onPress={() => onPress?.(1)} style={{ width: topCellW, height: cellH }}>
          <ExpoImage source={toAbsoluteUrl(urls[1])} style={{ width: topCellW, height: cellH }} contentFit="cover" transition={200} />
        </Pressable>
      </View>
      <View style={{ height: MOSAIC_GAP }} />
      <View style={mosaicStyles.row}>
        {urls.slice(2, 5).map((url, i) => (
          <View key={url} style={mosaicStyles.row}>
            {i > 0 ? <View style={{ width: MOSAIC_GAP }} /> : null}
            <Pressable onPress={() => onPress?.(i + 2)} style={{ width: botCellW, height: cellH }}>
              <ExpoImage source={toAbsoluteUrl(url)} style={{ width: botCellW, height: cellH }} contentFit="cover" transition={200} />
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}

const mosaicStyles = StyleSheet.create({
  single: { width: MOSAIC_MAX_W, aspectRatio: 4 / 3, overflow: "hidden" },
  singleImg: { width: "100%", height: "100%" },
  row: { flexDirection: "row" },
});

const REACTION_EMOJIS = [
  { key: "heart", display: String.fromCodePoint(0x2764, 0xFE0F) },
  { key: "laugh", display: String.fromCodePoint(0x1F602) },
  { key: "thumbs_up", display: String.fromCodePoint(0x1F44D) },
  { key: "thumbs_down", display: String.fromCodePoint(0x1F44E) },
] as const;

type ReactionMap = Record<string, { count: number; userIds: string[] }>;

type EnhancedMessage = ChatMessage & {
  reactions?: ReactionMap;
  parentId?: string | null;
  parentPreview?: { body: string; senderName: string } | null;
};

type Props = {
  message: EnhancedMessage;
  isMine: boolean;
  groupStyle?: GroupStyle;
  showStatus?: boolean;
  highlighted?: boolean;
  onImagePress?: (images: string[], index: number) => void;
  userAvatarMap?: Record<string, string | null>;
  userInfoMap?: Record<string, { name: string; avatar: string | null }>;
  conversationId?: string;
  viewerId?: string | null;
  onReaction?: (messageId: string, emoji: string, action: "add" | "remove") => void;
  onReply?: (message: EnhancedMessage) => void;
  onDelete?: (messageId: string) => void;
  onAvatarPress?: (user: { id: string; name: string; avatar: string | null }) => void;
  onGoToMessage?: (messageId: string) => void;
  onContextMenuOpen?: () => void;
  onContextMenuClose?: () => void;
};

function emojiDisplay(key: string): string {
  return REACTION_EMOJIS.find((e) => e.key === key)?.display ?? key;
}

const EMOJI_RE = /^(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F){1,3}$/u;
function isEmojiOnly(text: string): boolean {
  return EMOJI_RE.test(text.trim());
}

const SWIPE_THRESHOLD = 50;

function AnimatedReactionChip({
  emoji,
  count,
  isOwn,
  userAvatars,
  onPress,
}: {
  emoji: string;
  count: number;
  isOwn: boolean;
  userAvatars?: string[];
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const chipStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = useCallback(() => {
    scale.value = withSpring(1.3, { damping: 8, stiffness: 400 }, () => {
      scale.value = withSpring(1, { damping: 12, stiffness: 300 });
    });
    onPress();
  }, [onPress, scale]);

  const avatars = userAvatars?.slice(0, 3) ?? [];

  return (
    <Animated.View style={chipStyle}>
      <Pressable
        style={[styles.reactionChip, isOwn && styles.reactionChipOwn]}
        onPress={handlePress}
      >
        <Text style={styles.reactionEmoji}>{emojiDisplay(emoji)}</Text>
        {avatars.length > 0 ? (
          <View style={styles.reactionAvatarRow}>
            {avatars.map((uri, i) => (
              <Image
                key={uri + i}
                source={{ uri: toAbsoluteUrl(uri) }}
                style={[
                  styles.reactionAvatar,
                  i > 0 && { marginLeft: -4 },
                ]}
              />
            ))}
          </View>
        ) : count > 1 ? (
          <Text style={styles.reactionCount}>{count}</Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

function areBubblePropsEqual(prev: Props, next: Props): boolean {
  if (prev.isMine !== next.isMine) return false;
  if (prev.groupStyle !== next.groupStyle) return false;
  if (prev.showStatus !== next.showStatus) return false;
  if (prev.highlighted !== next.highlighted) return false;
  if (prev.viewerId !== next.viewerId) return false;
  if (prev.conversationId !== next.conversationId) return false;

  const pm = prev.message;
  const nm = next.message;
  if (pm.id !== nm.id) return false;
  if (pm.body !== nm.body) return false;
  if (pm.user.id !== nm.user.id) return false;
  if (pm.user.name !== nm.user.name) return false;
  if (pm.user.avatar !== nm.user.avatar) return false;
  if (pm.parentId !== nm.parentId) return false;
  if (pm.parentPreview?.body !== nm.parentPreview?.body) return false;
  if (pm.parentPreview?.senderName !== nm.parentPreview?.senderName) return false;

  const pr = pm.reactions;
  const nr = nm.reactions;
  if (pr !== nr) {
    if (!pr || !nr) return false;
    const pk = Object.keys(pr);
    const nk = Object.keys(nr);
    if (pk.length !== nk.length) return false;
    for (const k of pk) {
      if (pr[k].count !== nr[k]?.count) return false;
    }
  }

  return true;
}

export const ChatBubbleRow = memo(function ChatBubbleRow({
  message: m,
  isMine,
  groupStyle = "single",
  showStatus,
  highlighted,
  onImagePress,
  userAvatarMap,
  userInfoMap,
  conversationId,
  viewerId,
  onReaction,
  onReply,
  onDelete,
  onAvatarPress,
  onGoToMessage,
  onContextMenuOpen,
  onContextMenuClose,
}: Props) {
  const showAvatar = groupStyle === "single" || groupStyle === "bottom";
  const [reactionSheetVisible, setReactionSheetVisible] = useState(false);
  const showName = !isMine && (groupStyle === "single" || groupStyle === "top");
  const [pickerVisible, setPickerVisible] = useState(false);
  const [bubbleLayout, setBubbleLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const bubbleRef = useRef<View>(null);
  const translateX = useSharedValue(0);
  const highlightOpacity = useSharedValue(0);

  useEffect(() => {
    if (highlighted) {
      highlightOpacity.value = withSpring(1, { damping: 15, stiffness: 300 }, () => {
        highlightOpacity.value = withSpring(0, { damping: 15, stiffness: 120 });
      });
    }
  }, [highlighted, highlightOpacity]);

  const highlightStyle = useAnimatedStyle(() => ({
    opacity: highlightOpacity.value,
  }));


  const myCurrentEmoji = (() => {
    const vid = viewerId ?? "";
    if (!m.reactions || !vid) return null;
    for (const [emoji, data] of Object.entries(m.reactions)) {
      if (data.userIds?.includes(vid)) return emoji;
    }
    return null;
  })();

  const toggleHeart = useCallback(() => {
    if (!onReaction) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (myCurrentEmoji === "heart") {
      onReaction(m.id, "heart", "remove");
    } else {
      if (myCurrentEmoji) onReaction(m.id, myCurrentEmoji, "remove");
      onReaction(m.id, "heart", "add");
    }
  }, [m.id, myCurrentEmoji, onReaction]);

  const showPicker = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onContextMenuOpen?.();
    requestAnimationFrame(() => {
      Keyboard.dismiss();
      bubbleRef.current?.measureInWindow((x, y, width, height) => {
        setBubbleLayout({ x, y, width, height });
        setPickerVisible(true);
      });
    });
  }, [onContextMenuOpen]);

  const closePicker = useCallback(() => {
    setPickerVisible(false);
    setTimeout(() => onContextMenuClose?.(), 350);
  }, [onContextMenuClose]);

  const triggerReply = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onReply?.(m);
  }, [m, onReply]);

  const handleCopy = useCallback(() => {
    void Clipboard.setStringAsync(m.body ?? "");
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    closePicker();
  }, [m.body, closePicker]);

  const handleDeletePress = useCallback(() => {
    closePicker();
    Alert.alert("Delete Message", "Are you sure you want to delete this message?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => onDelete?.(m.id),
      },
    ]);
  }, [m.id, onDelete]);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (onReaction) {
        runOnJS(toggleHeart)();
      }
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .maxDuration(250);

  const tapGestures = Gesture.Exclusive(doubleTap, singleTap);

  const longPress = Gesture.LongPress()
    .minDuration(350)
    .onStart(() => {
      runOnJS(showPicker)();
    });

  const [swiping, setSwiping] = useState(false);

  const panGesture = Gesture.Pan()
    .activeOffsetX(isMine ? -20 : 20)
    .failOffsetY([-10, 10])
    .onStart(() => {
      runOnJS(setSwiping)(true);
    })
    .onUpdate((e) => {
      if (isMine) {
        if (e.translationX < 0) {
          translateX.value = Math.max(e.translationX, -80);
        }
      } else {
        if (e.translationX > 0) {
          translateX.value = Math.min(e.translationX, 80);
        }
      }
    })
    .onEnd(() => {
      const distance = Math.abs(translateX.value);
      if (distance > SWIPE_THRESHOLD && onReply) {
        runOnJS(triggerReply)();
      }
      translateX.value = withSpring(0, {
        damping: 30,
        stiffness: 600,
        overshootClamping: true,
      }, () => {
        runOnJS(setSwiping)(false);
      });
    });

  const composed = Gesture.Race(panGesture, Gesture.Simultaneous(longPress, tapGestures));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const replyIconStyle = useAnimatedStyle(() => {
    const progress = Math.min(Math.abs(translateX.value) / SWIPE_THRESHOLD, 1);
    return {
      opacity: progress,
      transform: [{ scale: progress }],
    };
  });

  const handlePickReaction = useCallback(
    (emoji: string) => {
      closePicker();
      if (!onReaction) return;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (myCurrentEmoji === emoji) {
        onReaction(m.id, emoji, "remove");
      } else {
        if (myCurrentEmoji) onReaction(m.id, myCurrentEmoji, "remove");
        onReaction(m.id, emoji, "add");
      }
    },
    [m.id, myCurrentEmoji, onReaction],
  );

  const avatarImage = m.user.avatar ? (
    <Image
      source={{ uri: toAbsoluteUrl(m.user.avatar) }}
      style={legacyStyles.avatar}
    />
  ) : (
    <View style={[legacyStyles.avatar, legacyStyles.avatarFallback]}>
      <Text style={legacyStyles.avatarInitial}>
        {m.user.name.trim().charAt(0).toUpperCase() || "?"}
      </Text>
    </View>
  );

  const avatarEl = onAvatarPress ? (
    <Pressable onPress={() => onAvatarPress(m.user)}>{avatarImage}</Pressable>
  ) : (
    avatarImage
  );

  const reactions = m.reactions ?? {};
  const hasReactions = Object.keys(reactions).length > 0;

  const reactionChips = hasReactions ? (
    <View style={styles.reactionRow}>
      {Object.entries(reactions).map(([emoji, data]) => {
        const isOwn = data.userIds?.includes(viewerId ?? "");
        const avatars = userAvatarMap
          ? data.userIds
              ?.map((uid) => userAvatarMap[uid])
              .filter((a): a is string => Boolean(a))
              .slice(0, 3) ?? []
          : [];
        return (
          <AnimatedReactionChip
            key={emoji}
            emoji={emoji}
            count={data.count}
            isOwn={isOwn}
            userAvatars={avatars}
            onPress={() => setReactionSheetVisible(true)}
          />
        );
      })}
    </View>
  ) : null;

  const replyPreview = m.parentPreview ? (
    <Pressable
      style={[styles.replyPreview, isMine ? styles.replyPreviewMine : styles.replyPreviewTheirs]}
      onPress={() => m.parentId && onGoToMessage?.(m.parentId)}
      disabled={!m.parentId || !onGoToMessage}
    >
      <View style={[styles.replyBar, isMine ? styles.replyBarMine : null]} />
      <View style={styles.replyTextCol}>
        <Text style={[styles.replySender, isMine ? styles.replySenderMine : null]} numberOfLines={1}>
          {m.parentPreview.senderName}
        </Text>
        <Text style={[styles.replyBody, isMine ? styles.replyBodyMine : null]} numberOfLines={2}>
          {m.parentPreview.body}
        </Text>
      </View>
    </Pressable>
  ) : null;

  const avatarSpacer = <View style={styles.avatarSpacer} />;

  const imageUrls = getImageUrls(m.attachments);
  const hasImages = imageUrls.length > 0;
  const bodyText = m.body ?? "";
  const emojiOnly = !hasImages && !m.parentPreview && isEmojiOnly(bodyText);

  const RADIUS = 18;
  const GROUPED_RADIUS = 4;
  const TAIL_RADIUS = 2;
  const hasTail = groupStyle === "single" || groupStyle === "bottom";
  const isGroupedTop = groupStyle === "middle" || groupStyle === "bottom";
  const bubbleRadii = {
    borderTopLeftRadius: isMine ? RADIUS : (isGroupedTop ? GROUPED_RADIUS : RADIUS),
    borderTopRightRadius: isMine ? (isGroupedTop ? GROUPED_RADIUS : RADIUS) : RADIUS,
    borderBottomLeftRadius: isMine ? RADIUS : (hasTail ? TAIL_RADIUS : GROUPED_RADIUS),
    borderBottomRightRadius: isMine ? (hasTail ? TAIL_RADIUS : GROUPED_RADIUS) : RADIUS,
  };

  const handleMosaicPress = useCallback(
    (index: number) => {
      onImagePress?.(imageUrls, index);
    },
    [imageUrls, onImagePress],
  );

  const imageBodyBubble = hasImages && bodyText ? (
    isMine ? (
      <View style={[legacyStyles.bubble, legacyStyles.bubbleMine, {
        borderRadius: RADIUS,
        borderBottomRightRadius: TAIL_RADIUS,
        marginTop: 4,
      }]}>
        <Autolink
          text={bodyText}
          style={[legacyStyles.bubbleBody, legacyStyles.bubbleBodyMine]}
          linkStyle={styles.linkMine}
          url email phone
        />
      </View>
    ) : (
      <View style={[legacyStyles.bubble, legacyStyles.bubbleTheirs, {
        borderRadius: RADIUS,
        borderBottomLeftRadius: TAIL_RADIUS,
        marginTop: 4,
      }]}>
        <Autolink
          text={bodyText}
          style={legacyStyles.bubbleBody}
          linkStyle={styles.linkTheirs}
          url email phone
        />
      </View>
    )
  ) : null;

  const messageBody = hasImages ? (
    <View>
      {showName && !isMine ? <Text style={legacyStyles.bubbleName}>{m.user.name}</Text> : null}
      <ImageMosaic urls={imageUrls} radii={bubbleRadii} onPress={handleMosaicPress} />
    </View>
  ) : emojiOnly ? (
    <Text style={styles.emojiOnlyText}>{bodyText.trim()}</Text>
  ) : isMine ? (
    <View style={[legacyStyles.bubble, legacyStyles.bubbleMine, bubbleRadii]}>
      <Autolink
        text={bodyText}
        style={[legacyStyles.bubbleBody, legacyStyles.bubbleBodyMine]}
        linkStyle={styles.linkMine}
        url
        email
        phone
      />
    </View>
  ) : (
    <View style={[legacyStyles.bubble, legacyStyles.bubbleTheirs, bubbleRadii]}>
      {showName ? <Text style={legacyStyles.bubbleName}>{m.user.name}</Text> : null}
      <Autolink
        text={bodyText}
        style={legacyStyles.bubbleBody}
        linkStyle={styles.linkTheirs}
        url
        email
        phone
      />
    </View>
  );

  const bubbleInnerContent = (
    <>
      {replyPreview}
      {emojiOnly && showName && !isMine ? <Text style={legacyStyles.bubbleName}>{m.user.name}</Text> : null}
      {messageBody}
      {imageBodyBubble}
      {reactionChips}
    </>
  );

  return (
    <View style={styles.swipeContainer}>
      <Animated.View style={[styles.highlightOverlay, highlightStyle]} pointerEvents="none" />
      {swiping ? (
        <Animated.View style={[styles.replyIconWrap, isMine ? styles.replyIconRight : styles.replyIconLeft, replyIconStyle]}>
          <Ionicons name="arrow-undo" size={18} color={colors.muted} />
        </Animated.View>
      ) : null}
      <GestureDetector gesture={composed}>
        <Animated.View
          style={[
            legacyStyles.bubbleRow,
            groupStyle === "middle" || groupStyle === "bottom" ? styles.groupedRow : null,
            animatedStyle,
            pickerVisible && styles.hiddenBubble,
          ]}
        >
          {isMine ? (
            <>
              <View style={legacyStyles.bubbleRowFlex} />
              <View ref={bubbleRef} style={[styles.bubbleCol, styles.bubbleColMine]}>
                {bubbleInnerContent}
              </View>
            </>
          ) : (
            <>
              {showAvatar ? avatarEl : avatarSpacer}
              <View ref={bubbleRef} style={[styles.bubbleCol, styles.bubbleColTheirs]}>
                {bubbleInnerContent}
              </View>
            </>
          )}
        </Animated.View>
      </GestureDetector>

      {showStatus && isMine ? (
        <View style={styles.statusRow}>
          <Ionicons
            name={m.id.startsWith("optimistic-") ? "time-outline" : "checkmark"}
            size={14}
            color={colors.muted}
          />
          <Text style={styles.statusText}>
            {m.id.startsWith("optimistic-") ? "Sending" : "Sent"}
          </Text>
        </View>
      ) : null}

      <Modal
        visible={pickerVisible}
        transparent
        animationType="none"
        onRequestClose={closePicker}
        statusBarTranslucent
      >
        <Pressable style={styles.overlay} onPress={closePicker}>
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          {bubbleLayout ? (() => {
            const screen = Dimensions.get("window");
            const PICKER_H = 54;
            const GAP = 8;
            const actionCount = (bodyText ? 1 : 0) + (onReply ? 1 : 0) + (isMine && onDelete ? 1 : 0);
            const MENU_H = actionCount * 48;

            let bubbleTop = bubbleLayout.y;
            const bottomEdge = bubbleTop + bubbleLayout.height + GAP + MENU_H;
            if (bottomEdge > screen.height - 40) {
              bubbleTop = screen.height - 40 - bubbleLayout.height - GAP - MENU_H;
            }
            if (bubbleTop - GAP - PICKER_H < 40) {
              bubbleTop = 40 + PICKER_H + GAP;
            }

            return (
              <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                {/* Reaction picker above bubble */}
                <View
                  style={[
                    styles.pickerPill,
                    {
                      position: "absolute",
                      top: bubbleTop - GAP - PICKER_H,
                      left: isMine ? undefined : bubbleLayout.x,
                      right: isMine ? screen.width - bubbleLayout.x - bubbleLayout.width : undefined,
                    },
                  ]}
                >
                  {REACTION_EMOJIS.map((e) => (
                    <Pressable
                      key={e.key}
                      style={[styles.pickerItem, myCurrentEmoji === e.key && styles.pickerItemActive]}
                      onPress={() => handlePickReaction(e.key)}
                    >
                      <Text style={styles.pickerEmoji}>{e.display}</Text>
                    </Pressable>
                  ))}
                </View>

                {/* Plucked bubble at exact position */}
                <View
                  style={[
                    isMine ? styles.bubbleColMine : styles.bubbleColTheirs,
                    {
                      position: "absolute",
                      top: bubbleTop,
                      left: bubbleLayout.x,
                      width: bubbleLayout.width,
                    },
                  ]}
                  pointerEvents="none"
                >
                  {bubbleInnerContent}
                </View>

                {/* Context menu below bubble */}
                <View
                  style={[
                    styles.contextActions,
                    {
                      position: "absolute",
                      top: bubbleTop + bubbleLayout.height + GAP,
                      left: isMine ? undefined : bubbleLayout.x,
                      right: isMine ? screen.width - bubbleLayout.x - bubbleLayout.width : undefined,
                    },
                  ]}
                >
                  {bodyText ? (
                    <Pressable style={styles.contextAction} onPress={handleCopy}>
                      <Ionicons name="copy-outline" size={18} color={colors.text} />
                      <Text style={styles.contextActionText}>Copy</Text>
                    </Pressable>
                  ) : null}
                  {onReply ? (
                    <Pressable
                      style={styles.contextAction}
                      onPress={() => {
                        closePicker();
                        triggerReply();
                      }}
                    >
                      <Ionicons name="arrow-undo-outline" size={18} color={colors.text} />
                      <Text style={styles.contextActionText}>Reply</Text>
                    </Pressable>
                  ) : null}
                  {isMine && onDelete ? (
                    <Pressable style={styles.contextAction} onPress={handleDeletePress}>
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                      <Text style={[styles.contextActionText, { color: colors.danger }]}>Delete</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })() : null}
        </Pressable>
      </Modal>

      <AnimatedBottomSheetFrame
        visible={reactionSheetVisible}
        onClose={() => setReactionSheetVisible(false)}
      >
        <View style={sheetStyles.container}>
          <Text style={sheetStyles.title}>Reactions</Text>
          {Object.entries(reactions).map(([emoji, data]) => (
            <View key={emoji} style={sheetStyles.emojiSection}>
              <Text style={sheetStyles.emojiHeader}>
                {emojiDisplay(emoji)} {data.count}
              </Text>
              {data.userIds.map((uid) => {
                const info = userInfoMap?.[uid];
                const avatarUri = info?.avatar ?? userAvatarMap?.[uid];
                return (
                  <View key={uid} style={sheetStyles.userRow}>
                    {avatarUri ? (
                      <Image
                        source={{ uri: toAbsoluteUrl(avatarUri) }}
                        style={sheetStyles.userAvatar}
                      />
                    ) : (
                      <View style={[sheetStyles.userAvatar, sheetStyles.userAvatarFallback]}>
                        <Text style={sheetStyles.userInitial}>
                          {(info?.name ?? "?").charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <Text style={sheetStyles.userName}>
                      {info?.name ?? "Unknown"}
                    </Text>
                    {uid === viewerId ? (
                      <Text style={sheetStyles.youLabel}>You</Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </AnimatedBottomSheetFrame>
    </View>
  );
}, areBubblePropsEqual);

const styles = StyleSheet.create({
  swipeContainer: {
    width: "100%",
  },
  highlightOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(26, 60, 42, 0.12)",
    borderRadius: 12,
  },
  replyIconWrap: {
    position: "absolute",
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    width: 32,
  },
  replyIconLeft: {
    left: 4,
  },
  replyIconRight: {
    right: 4,
  },
  hiddenBubble: {
    opacity: 0,
  },
  groupedRow: {},
  avatarSpacer: {
    width: 28,
  },
  bubbleCol: {
    flexShrink: 1,
    maxWidth: "78%",
  },
  bubbleColMine: {
    alignItems: "flex-end",
  },
  bubbleColTheirs: {
    alignItems: "flex-start",
  },
  reactionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: -6,
    paddingHorizontal: 4,
    zIndex: 1,
  },
  reactionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "#f1efea",
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  reactionChipOwn: {
    backgroundColor: "#d4e8da",
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionCount: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: "600",
  },
  reactionAvatarRow: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 2,
  },
  reactionAvatar: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#fff",
  },
  replyPreview: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    gap: 8,
  },
  replyPreviewTheirs: {
    backgroundColor: "#eae8e3",
  },
  replyPreviewMine: {
    backgroundColor: "#3a6b4a",
  },
  replyBar: {
    width: 3,
    alignSelf: "stretch",
    backgroundColor: colors.fairway,
    borderRadius: 1.5,
    minHeight: 20,
  },
  replyBarMine: {
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  replyTextCol: {
    flexShrink: 1,
    gap: 1,
  },
  replySender: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  replySenderMine: {
    color: "rgba(255,255,255,0.9)",
  },
  replyBody: {
    fontSize: 13,
    color: colors.muted,
  },
  replyBodyMine: {
    color: "rgba(255,255,255,0.65)",
  },
  overlay: {
    flex: 1,
  },
  pickerPill: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 22,
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 2,
    alignSelf: "flex-start",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 8,
  },
  pickerItem: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerItemActive: {
    backgroundColor: colors.fairwaySoft,
  },
  pickerEmoji: {
    fontSize: 26,
  },
  contextActions: {
    backgroundColor: "#fff",
    borderRadius: 14,
    overflow: "hidden",
    alignSelf: "flex-start",
    minWidth: 200,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  contextAlignRight: {
    alignSelf: "flex-end",
  },
  contextAlignLeft: {
    alignSelf: "flex-start",
  },
  contextAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  contextActionText: {
    fontSize: 16,
    color: colors.text,
  },
  emojiOnlyText: {
    fontSize: 48,
    lineHeight: 56,
  },
  linkTheirs: {
    color: colors.fairway,
    textDecorationLine: "underline",
  },
  linkMine: {
    color: "#fff",
    textDecorationLine: "underline",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 3,
    paddingRight: 44,
    marginTop: 2,
  },
  statusText: {
    fontSize: 11,
    color: colors.muted,
  },
});

const sheetStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
  },
  emojiSection: {
    gap: 10,
  },
  emojiHeader: {
    fontSize: 20,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 2,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  userAvatarFallback: {
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  userInitial: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.muted,
  },
  userName: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
  },
  youLabel: {
    fontSize: 13,
    color: colors.muted,
  },
});
