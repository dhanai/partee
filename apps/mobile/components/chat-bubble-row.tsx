import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useRef, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { toAbsoluteUrl } from "../lib/api";
import { colors } from "../lib/theme";
import { type ChatMessage, roundGroupChatStyles as legacyStyles } from "./round-group-chat-poll";

const REACTION_EMOJIS = [
  { key: "heart", display: "❤️" },
  { key: "laugh", display: "😂" },
  { key: "thumbs_up", display: "👍" },
  { key: "thumbs_down", display: "👎" },
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

export const ChatBubbleRow = memo(function ChatBubbleRow({
  message: m,
  isMine,
  conversationId,
  viewerId,
  onReaction,
  onReply,
}: Props) {
  const [pickerVisible, setPickerVisible] = useState(false);
  const lastTapRef = useRef(0);
  const translateX = useSharedValue(0);

  const triggerReply = useCallback(() => {
    onReply?.(m);
  }, [m, onReply]);

  const panGesture = Gesture.Pan()
    .activeOffsetX(20)
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      if (e.translationX > 0) {
        translateX.value = Math.min(e.translationX, 80);
      }
    })
    .onEnd(() => {
      if (translateX.value > SWIPE_THRESHOLD && onReply) {
        runOnJS(triggerReply)();
      }
      translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const replyIconStyle = useAnimatedStyle(() => ({
    opacity: Math.min(translateX.value / SWIPE_THRESHOLD, 1),
    transform: [{ scale: Math.min(translateX.value / SWIPE_THRESHOLD, 1) }],
  }));

  const handlePress = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      if (conversationId && onReaction) {
        const hasMyHeart = m.reactions?.heart?.userIds?.includes(viewerId ?? "");
        onReaction(m.id, "heart", hasMyHeart ? "remove" : "add");
      }
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  }, [m.id, m.reactions, conversationId, viewerId, onReaction]);

  const handleLongPress = useCallback(() => {
    if (conversationId) {
      setPickerVisible(true);
    }
  }, [conversationId]);

  const handlePickReaction = useCallback(
    (emoji: string) => {
      setPickerVisible(false);
      if (onReaction) {
        const hasMyEmoji = m.reactions?.[emoji]?.userIds?.includes(viewerId ?? "");
        onReaction(m.id, emoji, hasMyEmoji ? "remove" : "add");
      }
    },
    [m.id, m.reactions, viewerId, onReaction],
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
            onPress={() => onReaction?.(m.id, emoji, isOwn ? "remove" : "add")}
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
    <View style={styles.replyPreview}>
      <View style={styles.replyBar} />
      <View style={styles.replyTextCol}>
        <Text style={styles.replySender} numberOfLines={1}>
          {m.parentPreview.senderName}
        </Text>
        <Text style={styles.replyBody} numberOfLines={1}>
          {m.parentPreview.body}
        </Text>
      </View>
    </View>
  ) : null;

  const bubbleContent = isMine ? (
    <>
      <View style={legacyStyles.bubbleRowFlex} />
      <View>
        <Pressable
          onPress={handlePress}
          onLongPress={handleLongPress}
          delayLongPress={400}
        >
          {replyPreview}
          <View style={[legacyStyles.bubble, legacyStyles.bubbleMine]}>
            <Text style={[legacyStyles.bubbleBody, legacyStyles.bubbleBodyMine]}>
              {m.body}
            </Text>
            <Text style={[legacyStyles.bubbleTime, legacyStyles.bubbleTimeMine]}>
              {formatTime(m.createdAt)}
            </Text>
          </View>
        </Pressable>
        {reactionChips}
      </View>
      {avatarEl}
    </>
  ) : (
    <>
      {avatarEl}
      <View>
        <Pressable
          onPress={handlePress}
          onLongPress={handleLongPress}
          delayLongPress={400}
        >
          {replyPreview}
          <View style={[legacyStyles.bubble, legacyStyles.bubbleTheirs]}>
            <Text style={legacyStyles.bubbleName}>{m.user.name}</Text>
            <Text style={legacyStyles.bubbleBody}>{m.body}</Text>
            <Text style={legacyStyles.bubbleTime}>{formatTime(m.createdAt)}</Text>
          </View>
        </Pressable>
        {reactionChips}
      </View>
    </>
  );

  return (
    <View style={styles.swipeContainer}>
      <Animated.View style={[styles.replyIconWrap, replyIconStyle]}>
        <Ionicons name="arrow-undo" size={18} color={colors.muted} />
      </Animated.View>
      <GestureDetector gesture={panGesture}>
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
          <View style={styles.pickerPill}>
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
        </Pressable>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  swipeContainer: {
    position: "relative",
    overflow: "hidden",
  },
  replyIconWrap: {
    position: "absolute",
    left: 4,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    width: 32,
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
  replyPreview: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    paddingLeft: 4,
    gap: 6,
  },
  replyBar: {
    width: 3,
    height: "100%",
    backgroundColor: colors.fairway,
    borderRadius: 1.5,
    minHeight: 24,
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
  replyBody: {
    fontSize: 12,
    color: colors.muted,
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
