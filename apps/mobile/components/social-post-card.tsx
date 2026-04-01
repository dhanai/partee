import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { toAbsoluteUrl } from "../lib/api";
import { colors } from "../lib/theme";
import { InitialAvatar } from "./initial-avatar";
import { PostImageCarousel } from "./post-image-carousel";

type PostUser = {
  id: string;
  name: string;
  avatar: string | null;
};

type Props = {
  user: PostUser;
  body: string;
  images: string[];
  createdAtLabel: string;
  isPinned?: boolean;
  likeCount?: number;
  commentCount?: number;
  viewerLiked?: boolean;
  showOverflow?: boolean;
  onPressAuthor?: () => void;
  onPressOverflow?: () => void;
  onPressImage: (index: number) => void;
  onToggleLike: () => void;
  onOpenComments: () => void;
  onDoubleTapLike: () => void;
};

export function SocialPostCard({
  user,
  body,
  images,
  createdAtLabel,
  isPinned = false,
  likeCount = 0,
  commentCount = 0,
  viewerLiked = false,
  showOverflow = false,
  onPressAuthor,
  onPressOverflow,
  onPressImage,
  onToggleLike,
  onOpenComments,
  onDoubleTapLike,
}: Props) {
  const heartScale = useSharedValue(0);
  const heartOpacity = useSharedValue(0);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      runOnJS(onDoubleTapLike)();
      heartScale.value = withSequence(withTiming(1.2, { duration: 180 }), withTiming(1, { duration: 100 }));
      heartOpacity.value = withSequence(
        withTiming(1, { duration: 120 }),
        withDelay(400, withTiming(0, { duration: 280 })),
      );
    });

  const heartAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
    opacity: heartOpacity.value,
  }));

  return (
    <GestureDetector gesture={doubleTap}>
      <View style={styles.wrapper}>
        <View style={styles.postCard}>
          <View style={styles.postHeader}>
            <Pressable style={styles.postAuthorTap} onPress={onPressAuthor} disabled={!onPressAuthor}>
              {user.avatar ? (
                <Image source={toAbsoluteUrl(user.avatar)} style={styles.postAvatar} contentFit="cover" transition={0} />
              ) : (
                <InitialAvatar name={user.name} size={36} maxInitials={2} />
              )}
              <View style={styles.postHeaderText}>
                <Text style={styles.postAuthor}>{user.name}</Text>
                <Text style={styles.postDate}>{createdAtLabel}</Text>
              </View>
            </Pressable>
            {isPinned ? <Ionicons name="pin" size={14} color={colors.muted} /> : null}
            {showOverflow && onPressOverflow ? (
              <Pressable style={styles.postOverflow} onPress={onPressOverflow} hitSlop={8}>
                <Ionicons name="ellipsis-horizontal" size={18} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.postBody}>{body}</Text>
          {images.length > 0 ? <PostImageCarousel images={images} onPressImage={onPressImage} /> : null}
          <View style={styles.postFooter}>
            <Pressable style={styles.postLikeBtn} onPress={onToggleLike}>
              <Ionicons name={viewerLiked ? "heart" : "heart-outline"} size={18} color={viewerLiked ? colors.danger : colors.muted} />
              {likeCount > 0 ? <Text style={[styles.postLikeCount, viewerLiked && styles.postLikeCountActive]}>{likeCount}</Text> : null}
            </Pressable>
            <Pressable style={styles.postCommentBtn} onPress={onOpenComments}>
              <Ionicons name="chatbubble-outline" size={17} color={colors.muted} />
              {commentCount > 0 ? <Text style={styles.postCommentCount}>{commentCount}</Text> : null}
            </Pressable>
          </View>
        </View>
        <Reanimated.View style={[styles.heartOverlay, heartAnimStyle]} pointerEvents="none">
          <Ionicons name="heart" size={64} color={colors.danger} />
        </Reanimated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: "relative" },
  heartOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center" },
  postCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  postHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  postAuthorTap: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  postAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#d9e8dc" },
  postHeaderText: { flex: 1, minWidth: 0 },
  postAuthor: { color: colors.text, fontWeight: "700", fontSize: 14 },
  postDate: { color: colors.muted, fontSize: 12 },
  postOverflow: { marginLeft: "auto", padding: 2 },
  postBody: { color: colors.text, lineHeight: 20, fontSize: 15 },
  postFooter: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 2 },
  postLikeBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  postLikeCount: { color: colors.muted, fontWeight: "700", fontSize: 13 },
  postLikeCountActive: { color: colors.danger },
  postCommentBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  postCommentCount: { color: colors.muted, fontWeight: "700", fontSize: 13 },
});
