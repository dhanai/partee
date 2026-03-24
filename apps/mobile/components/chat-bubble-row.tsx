import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { memo, useCallback, useRef, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutRectangle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { toAbsoluteUrl } from "../lib/api";
import { colors } from "../lib/theme";
import { type ChatMessage, roundGroupChatStyles as legacyStyles } from "./round-group-chat-poll";

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
  conversationId?: string;
  viewerId?: string | null;
  onReaction?: (messageId: string, emoji: string, action: "add" | "remove") => void;
  onReply?: (message: EnhancedMessage) => void;
};

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function emojiDisplay(key: string): string {
  return REACTION_EMOJIS.find((e) => e.key === key)?.display ?? key;
}

const SWIPE_THRESHOLD = 50;
const PICKER_ITEM_SIZE = 44;
const PICKER_PADDING = 8;
const PICKER_GAP = 4;
const PICKER_WIDTH =
  REACTION_EMOJIS.length * PICKER_ITEM_SIZE +
  (REACTION_EMOJIS.length - 1) * PICKER_GAP +
  PICKER_PADDING * 2;

export const ChatBubbleRow = memo(function ChatBubbleRow({
  message: m,
  isMine,
  conversationId,
  viewerId,
  onReaction,
  onReply,
}: Props) {
  const [pickerVisible, setPickerVisible] = useState(false);
  const [bubbleLayout, setBubbleLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const bubbleRef = useRef<View>(null);
  const translateX = useSharedValue(0);

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
    bubbleRef.current?.measureInWindow((x, y, width, height) => {
      setBubbleLayout({ x, y, width, height });
      setPickerVisible(true);
    });
  }, []);

  const triggerReply = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onReply?.(m);
  }, [m, onReply]);

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

  const panGesture = Gesture.Pan()
    .activeOffsetX(isMine ? -20 : 20)
    .failOffsetY([-10, 10])
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
      translateX.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.quad) });
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
      setPickerVisible(false);
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

  const avatarEl = m.user.avatar ? (
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

  const reactions = m.reactions ?? {};
  const hasReactions = Object.keys(reactions).length > 0;

  const reactionChips = hasReactions ? (
    <View style={styles.reactionRow}>
      {Object.entries(reactions).map(([emoji, data]) => {
        const isOwn = data.userIds?.includes(viewerId ?? "");
        return (
          <Pressable
            key={emoji}
            style={[styles.reactionChip, isOwn && styles.reactionChipOwn]}
            onPress={() => {
              if (!onReaction) return;
              if (isOwn) {
                onReaction(m.id, emoji, "remove");
              } else {
                if (myCurrentEmoji) onReaction(m.id, myCurrentEmoji, "remove");
                onReaction(m.id, emoji, "add");
              }
            }}
          >
            <Text style={styles.reactionEmoji}>{emojiDisplay(emoji)}</Text>
            {data.count > 1 && (
              <Text style={styles.reactionCount}>{data.count}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  ) : null;

  const replyPreview = m.parentPreview ? (
    <View style={[styles.replyPreview, isMine ? styles.replyPreviewMine : styles.replyPreviewTheirs]}>
      <View style={[styles.replyBar, isMine ? styles.replyBarMine : null]} />
      <View style={styles.replyTextCol}>
        <Text style={[styles.replySender, isMine ? styles.replySenderMine : null]} numberOfLines={1}>
          {m.parentPreview.senderName}
        </Text>
        <Text style={[styles.replyBody, isMine ? styles.replyBodyMine : null]} numberOfLines={2}>
          {m.parentPreview.body}
        </Text>
      </View>
    </View>
  ) : null;

  const bubbleContent = isMine ? (
    <>
      <View style={legacyStyles.bubbleRowFlex} />
      <View ref={bubbleRef} style={styles.bubbleCol}>
        <View style={[legacyStyles.bubble, legacyStyles.bubbleMine, m.parentPreview ? styles.bubbleWithReply : null]}>
          {replyPreview}
          <Text style={[legacyStyles.bubbleBody, legacyStyles.bubbleBodyMine]}>
            {m.body}
          </Text>
          <Text style={[legacyStyles.bubbleTime, legacyStyles.bubbleTimeMine]}>
            {formatTime(m.createdAt)}
          </Text>
        </View>
        {reactionChips}
      </View>
      {avatarEl}
    </>
  ) : (
    <>
      {avatarEl}
      <View ref={bubbleRef} style={styles.bubbleCol}>
        <View style={[legacyStyles.bubble, legacyStyles.bubbleTheirs, m.parentPreview ? styles.bubbleWithReply : null]}>
          {replyPreview}
          <Text style={legacyStyles.bubbleName}>{m.user.name}</Text>
          <Text style={legacyStyles.bubbleBody}>{m.body}</Text>
          <Text style={legacyStyles.bubbleTime}>{formatTime(m.createdAt)}</Text>
        </View>
        {reactionChips}
      </View>
    </>
  );

  return (
    <View style={styles.swipeContainer}>
      <Animated.View style={[styles.replyIconWrap, isMine ? styles.replyIconRight : styles.replyIconLeft, replyIconStyle]}>
        <Ionicons name="arrow-undo" size={18} color={colors.muted} />
      </Animated.View>
      <GestureDetector gesture={composed}>
        <Animated.View style={[legacyStyles.bubbleRow, animatedStyle]}>
          {bubbleContent}
        </Animated.View>
      </GestureDetector>

      <Modal
        visible={pickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerVisible(false)}
      >
        <Pressable
          style={styles.pickerOverlay}
          onPress={() => setPickerVisible(false)}
        >
          {bubbleLayout ? (
            <View
              style={[
                styles.pickerPill,
                {
                  position: "absolute",
                  top: bubbleLayout.y - 52,
                  left: isMine
                    ? bubbleLayout.x + bubbleLayout.width - PICKER_WIDTH
                    : bubbleLayout.x,
                },
              ]}
            >
              {REACTION_EMOJIS.map((e) => (
                <Pressable
                  key={e.key}
                  style={styles.pickerItem}
                  onPress={() => handlePickReaction(e.key)}
                >
                  <Text style={styles.pickerEmoji}>{e.display}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  swipeContainer: {
    width: "100%",
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
  bubbleCol: {
    flexShrink: 1,
    maxWidth: "78%",
  },
  reactionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  reactionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "#f1efea",
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reactionChipOwn: {
    borderColor: colors.fairway,
    backgroundColor: colors.fairwaySoft,
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionCount: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: "600",
  },
  bubbleWithReply: {
    paddingTop: 4,
    paddingHorizontal: 4,
  },
  replyPreview: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 6,
  },
  replyPreviewTheirs: {
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  replyPreviewMine: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  replyBar: {
    width: 3,
    alignSelf: "stretch",
    backgroundColor: colors.fairway,
    borderRadius: 1.5,
    minHeight: 20,
  },
  replyBarMine: {
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  replyTextCol: {
    flex: 1,
    gap: 1,
  },
  replySender: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.fairway,
  },
  replySenderMine: {
    color: "rgba(255,255,255,0.85)",
  },
  replyBody: {
    fontSize: 12,
    color: colors.muted,
  },
  replyBodyMine: {
    color: "rgba(255,255,255,0.7)",
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  pickerPill: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 28,
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  pickerItem: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerEmoji: {
    fontSize: 24,
  },
});
