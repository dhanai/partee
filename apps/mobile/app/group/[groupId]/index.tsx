import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withDelay,
  runOnJS,
} from "react-native-reanimated";
import { AnimatedBottomSheetFrame, BottomSheetScrollView, BottomSheetTextInput } from "../../../components/animated-bottom-sheet-frame";
import { InitialAvatar } from "../../../components/initial-avatar";
import { OverflowMenuSheet } from "../../../components/overflow-menu-sheet";
import { ReportSheet } from "../../../components/report-sheet";
import { RoundListCard } from "../../../components/round-list-card";
import { useAbly } from "ably/react";
import { apiDelete, apiGet, apiPatch, apiPost, publicWebOrigin, toAbsoluteUrl } from "../../../lib/api";
import { subscribeGroupActivityEvents } from "../../../lib/group-activity-events";
import { hapticLight } from "../../../lib/haptics";
import { getCachedMeProfile, subscribeMeProfile } from "../../../lib/me-profile-cache";
import { parfadeGroupChannel, parfadePostChannel } from "../../../lib/parfade-ably-channels";
import { parseParfadeRealtimeMessage } from "../../../lib/parfade-ably-messages";
import {
  formatPlanningHeaderDate,
  formatPlanningWindow,
  formatScheduledCardMeta,
  getTimeWindows,
} from "../../../lib/round-card-meta";
import { uploadImage, AVATAR_MAX_BYTES, COVER_MAX_BYTES } from "../../../lib/upload-image";
import { FullscreenImageViewer } from "../../../components/fullscreen-image-viewer";
import { useSnackbar } from "../../../lib/snackbar-context";
import { colors } from "../../../lib/theme";

type GroupDetail = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  heroImageUrl: string | null;
  joinPolicy: string;
  createdBy: string;
  memberCount: number;
  myRole: "owner" | "admin" | "member" | null;
  myMuteGroupPush?: boolean;
  conversationId: string | null;
};

type ActivityItem = {
  type: "post" | "round_created" | "member_joined";
  id: string;
  body?: string;
  imageUrl?: string | null;
  isPinned?: boolean;
  likeCount?: number;
  commentCount?: number;
  viewerLiked?: boolean;
  createdAt: string;
  joinedAt?: string;
  roundId?: string;
  roundToken?: string;
  mode?: "scheduled" | "planning" | "tournament";
  courseName?: string | null;
  targetDate?: string;
  teeTime?: string | null;
  planningLocation?: string | null;
  preferredTimeWindows?: string[] | null;
  joinPolicy?: "instant" | "approval";
  totalSpots?: number;
  confirmedPlayers?: Array<{ id: string; name: string; avatar: string | null }>;
  user: { id: string; name: string; avatar: string | null };
};

type CommentItem = {
  id: string;
  body: string;
  createdAt: string;
  user: { id: string; name: string; avatar: string | null };
};

const COMMENT_SNAP_POINTS = ["55%"] as const;

function computeBootstrapGroup(
  groupId: string,
  hintName?: string | string[],
  hintImage?: string | string[],
  hintHero?: string | string[],
  hintMembers?: string | string[],
  hintRole?: string | string[],
): GroupDetail | null {
  const name = typeof hintName === "string" ? hintName.trim() : "";
  if (!name) return null;
  const imageUrl = typeof hintImage === "string" && hintImage ? hintImage : null;
  const heroImageUrl = typeof hintHero === "string" && hintHero ? hintHero : null;
  const memberCount = typeof hintMembers === "string" ? Number(hintMembers) || 0 : 0;
  const role = typeof hintRole === "string" ? hintRole : null;
  return {
    id: groupId,
    name,
    description: null,
    imageUrl,
    heroImageUrl,
    joinPolicy: "approval",
    createdBy: "",
    memberCount,
    myRole: (role as GroupDetail["myRole"]) ?? null,
    myMuteGroupPush: false,
    conversationId: null,
  };
}

export default function GroupLandingScreen() {
  const {
    groupId,
    hintName,
    hintImage,
    hintHero,
    hintMembers,
    hintRole,
  } = useLocalSearchParams<{
    groupId: string;
    hintName?: string;
    hintImage?: string;
    hintHero?: string;
    hintMembers?: string;
    hintRole?: string;
  }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);

  const [bootstrap] = useState(() => computeBootstrapGroup(groupId, hintName, hintImage, hintHero, hintMembers, hintRole));
  const [group, setGroup] = useState<GroupDetail | null>(bootstrap);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(!bootstrap);
  const [apiResolved, setApiResolved] = useState(false);

  const [prevGroupId, setPrevGroupId] = useState(groupId);
  if (groupId !== prevGroupId) {
    setPrevGroupId(groupId);
    const next = computeBootstrapGroup(groupId, hintName, hintImage, hintHero, hintMembers, hintRole);
    setGroup(next);
    setLoading(!next);
    setActivity([]);
    setApiResolved(false);
  }
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Fullscreen image viewer
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerVisible, setViewerVisible] = useState(false);

  // Image upload
  const [uploadingImage, setUploadingImage] = useState<"profile" | "hero" | null>(null);

  const { show: showSnackbar } = useSnackbar();
  const [overflowItem, setOverflowItem] = useState<ActivityItem | null>(null);
  const [reportItem, setReportItem] = useState<ActivityItem | null>(null);
  const [reportComment, setReportComment] = useState<CommentItem | null>(null);
  const [groupOverflowOpen, setGroupOverflowOpen] = useState(false);

  // Comments bottom sheet
  const [commentSheetItem, setCommentSheetItem] = useState<ActivityItem | null>(null);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const commentInputRef = useRef<TextInput>(null) as React.RefObject<any>;

  // Reactive profile for composer + permission checks
  const [meAvatar, setMeAvatar] = useState<string | null>(getCachedMeProfile()?.avatar ?? null);
  const [meId, setMeId] = useState<string | null>(getCachedMeProfile()?.id ?? null);

  useEffect(() => {
    const cached = getCachedMeProfile();
    if (cached?.avatar) setMeAvatar(cached.avatar);
    if (cached?.id) setMeId(cached.id);
    return subscribeMeProfile((p) => {
      setMeAvatar(p.avatar ?? null);
      setMeId(p.id ?? null);
    });
  }, []);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const ably = useAbly();
  const rawPostId = (item: ActivityItem) => item.id.replace(/^(post|ann)-/, "");

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      setLoadError(null);
      try {
        const token = await getTokenRef.current();
        const [groupData, activityData] = await Promise.all([
          apiGet<{ group: GroupDetail }>(`/api/groups/${groupId}`, token),
          apiGet<{ activity: ActivityItem[]; nextCursor: string | null }>(
            `/api/groups/${groupId}/activity`,
            token,
          ),
        ]);
        setGroup(groupData.group);
        const memberOfGroup = groupData.group.myRole !== null;
        setActivity(memberOfGroup ? activityData.activity : []);
        setNextCursor(memberOfGroup ? activityData.nextCursor : null);
        setApiResolved(true);
      } catch (e) {
        if (!group) {
          setLoadError(e instanceof Error ? e.message : "Unable to load group.");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [groupId],
  );

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const token = await getTokenRef.current();
      const data = await apiGet<{ activity: ActivityItem[]; nextCursor: string | null }>(
        `/api/groups/${groupId}/activity?cursor=${encodeURIComponent(nextCursor)}`,
        token,
      );
      setActivity((prev) => {
        const existing = new Set(prev.map((i) => i.id));
        const fresh = data.activity.filter((i) => !existing.has(i.id));
        return [...prev, ...fresh];
      });
      setNextCursor(data.nextCursor);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  }, [groupId, nextCursor, loadingMore]);

  const didInitialLoad = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (didInitialLoad.current) {
        void load({ silent: true });
      } else {
        didInitialLoad.current = true;
        void load({ silent: !!bootstrap });
      }
    }, [load]),
  );

  useEffect(() => {
    return subscribeGroupActivityEvents((event) => {
      if (event.groupId !== groupId) return;
      if (event.action === "created" && event.post) {
        const optimistic: ActivityItem = {
          type: "post",
          id: `post-${event.post.id}`,
          body: event.post.body,
          imageUrl: event.post.imageUrl,
          isPinned: event.post.isPinned,
          createdAt: event.post.createdAt,
          likeCount: 0,
          commentCount: 0,
          viewerLiked: false,
          user: event.post.user,
        };
        setActivity((prev) => {
          const without = prev.filter((item) => item.id !== optimistic.id);
          return [optimistic, ...without];
        });
        return;
      }
      void load({ silent: true });
    });
  }, [groupId, load]);

  // Real-time: group activity feed updates
  useEffect(() => {
    if (!groupId) return;
    const channel = ably.channels.get(parfadeGroupChannel(groupId));
    const handler = (msg: import("ably").Message) => {
      const parsed = parseParfadeRealtimeMessage(msg.data);
      if (parsed?.type === "group-activity-updated") {
        void load({ silent: true });
      }
    };
    void channel.subscribe("parfade", handler);
    return () => { void channel.unsubscribe("parfade", handler); };
  }, [ably, groupId, load]);

  // Real-time: comment counts on all loaded post cards + live comments when sheet is open
  const postIds = useMemo(
    () => activity.filter((a) => a.type === "post").map((a) => rawPostId(a)),
    [activity],
  );
  const openPostId = commentSheetItem ? rawPostId(commentSheetItem) : null;
  useEffect(() => {
    if (postIds.length === 0) return;
    const subs: { channel: ReturnType<typeof ably.channels.get>; handler: (msg: import("ably").Message) => void }[] = [];
    for (const pid of postIds) {
      const channel = ably.channels.get(parfadePostChannel(pid));
      const handler = (msg: import("ably").Message) => {
        const parsed = parseParfadeRealtimeMessage(msg.data);
        if (parsed?.type === "post-comment-added" && parsed.postId === pid && parsed.comment.user.id !== meId) {
          setActivity((prev) =>
            prev.map((a) =>
              rawPostId(a) === pid
                ? { ...a, commentCount: (a.commentCount ?? 0) + 1 }
                : a,
            ),
          );
          if (pid === openPostId) {
            setComments((prev) => {
              if (prev.some((c) => c.id === parsed.comment.id)) return prev;
              return [...prev, parsed.comment];
            });
          }
        }
        if (parsed?.type === "post-like-updated" && parsed.postId === pid && parsed.userId !== meId) {
          setActivity((prev) =>
            prev.map((a) =>
              rawPostId(a) === pid
                ? { ...a, likeCount: (a.likeCount ?? 0) + (parsed.liked ? 1 : -1) }
                : a,
            ),
          );
        }
      };
      void channel.subscribe("parfade", handler);
      subs.push({ channel, handler });
    }
    return () => {
      for (const { channel, handler } of subs) {
        void channel.unsubscribe("parfade", handler);
      }
    };
  }, [ably, postIds, meId, openPostId]);

  useLayoutEffect(() => {
    if (bootstrap?.name) {
      navigation.setOptions({ title: bootstrap.name });
    }
  }, []);

  useEffect(() => {
    if (!group) return;
    navigation.setOptions({
      title: group.name,
      headerRight: () => (
        <Pressable
          onPress={() => setGroupOverflowOpen(true)}
          hitSlop={8}
          accessibilityLabel="Group options"
          style={{ paddingHorizontal: 8 }}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
        </Pressable>
      ),
      headerRightContainerStyle: { paddingRight: 12 },
    });
  }, [navigation, group]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load({ silent: true });
  }, [load]);

  // ── Image upload ──────────────────────────────────────────────

  const pickAndUploadImage = useCallback(
    async (kind: "profile" | "hero") => {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission required", "Photo library access is needed to upload images.");
        return;
      }

      const isProfile = kind === "profile";
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        allowsEditing: true,
        aspect: isProfile ? [1, 1] : [16, 9],
      });

      if (result.canceled || !result.assets[0]?.uri) return;

      setUploadingImage(kind);
      try {
        const asset = result.assets[0];
        const url = await uploadImage({
          uri: asset.uri,
          filename: `group-${kind}.jpg`,
          maxBytes: isProfile ? AVATAR_MAX_BYTES : COVER_MAX_BYTES,
          getToken: getTokenRef.current,
          width: asset.width,
          height: asset.height,
        });

        const patch: Record<string, string | null> = {};
        if (isProfile) patch.imageUrl = url;
        else patch.heroImageUrl = url;

        const token = await getTokenRef.current();
        await apiPatch(`/api/groups/${groupId}`, patch, token);
        void load({ silent: true });
      } catch (e) {
        Alert.alert("Upload failed", e instanceof Error ? e.message : "Could not upload image.");
      } finally {
        setUploadingImage(null);
      }
    },
    [groupId, load],
  );

  // ── Join ──────────────────────────────────────────────────────

  const handleJoin = useCallback(async () => {
    try {
      const token = await getTokenRef.current();
      const data = await apiPost<{ status: string }>(
        `/api/groups/${groupId}/join`,
        {},
        token,
      );
      if (data.status === "joined" || data.status === "already_member") {
        setGroup((prev) =>
          prev ? { ...prev, myRole: "member", memberCount: prev.memberCount + 1 } : prev,
        );
        showSnackbar("Joined group");
        void load({ silent: true });
      } else if (data.status === "requested") {
        showSnackbar("Request sent — awaiting approval");
      }
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not join.");
    }
  }, [groupId, load, showSnackbar]);

  const handleToggleGroupPushMute = useCallback(async () => {
    if (!group) return;
    const next = !(group.myMuteGroupPush ?? false);
    setGroup((prev) => (prev ? { ...prev, myMuteGroupPush: next } : prev));
    setGroupOverflowOpen(false);
    try {
      const token = await getTokenRef.current();
      await apiPatch(`/api/groups/${group.id}`, { muteGroupPush: next }, token);
      showSnackbar(next ? "Group push muted" : "Group push unmuted");
    } catch (e) {
      setGroup((prev) => (prev ? { ...prev, myMuteGroupPush: !next } : prev));
      Alert.alert("Error", e instanceof Error ? e.message : "Could not update push setting.");
    }
  }, [group, showSnackbar]);

  // ── Announcements ─────────────────────────────────────────────

  const openNewAnnouncement = useCallback(() => {
    router.push({ pathname: "/group/[groupId]/post", params: { groupId } });
  }, [router, groupId]);

  const openEditAnnouncement = useCallback((item: ActivityItem) => {
    setOverflowItem(null);
    router.push({
      pathname: "/group/[groupId]/post",
      params: {
        groupId,
        editId: rawPostId(item),
        editBody: item.body ?? "",
        ...(item.imageUrl ? { editImageUrl: item.imageUrl } : {}),
      },
    });
  }, [router, groupId]);

  const handleDeleteAnnouncement = useCallback(
    (item: ActivityItem) => {
      setOverflowItem(null);
      const id = rawPostId(item);
      Alert.alert("Delete post", "This cannot be undone.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const token = await getTokenRef.current();
              await apiDelete(
                `/api/groups/${groupId}/announcements?id=${id}`,
                token,
              );
              setActivity((prev) => prev.filter((a) => rawPostId(a) !== id));
              showSnackbar("Post deleted");
            } catch (e) {
              Alert.alert("Error", e instanceof Error ? e.message : "Could not delete.");
            }
          },
        },
      ]);
    },
    [groupId, showSnackbar],
  );

  const handleToggleLike = useCallback(
    async (item: ActivityItem) => {
      hapticLight();
      const id = rawPostId(item);
      const wasLiked = item.viewerLiked ?? false;
      setActivity((prev) =>
        prev.map((a) =>
          a.id === item.id
            ? {
                ...a,
                viewerLiked: !wasLiked,
                likeCount: Math.max(0, (a.likeCount ?? 0) + (wasLiked ? -1 : 1)),
              }
            : a,
        ),
      );
      try {
        const token = await getTokenRef.current();
        await apiPost(`/api/groups/${groupId}/announcements/like`, { announcementId: id }, token);
      } catch {
        setActivity((prev) =>
          prev.map((a) =>
            a.id === item.id
              ? {
                  ...a,
                  viewerLiked: wasLiked,
                  likeCount: Math.max(0, (a.likeCount ?? 0) + (wasLiked ? 1 : -1)),
                }
              : a,
          ),
        );
      }
    },
    [groupId],
  );

  const handleDoubleTapLike = useCallback(
    (item: ActivityItem) => {
      if (item.viewerLiked) return;
      void handleToggleLike(item);
    },
    [handleToggleLike],
  );

  const handleTogglePin = useCallback(
    async (item: ActivityItem) => {
      const id = rawPostId(item);
      const newPinned = !item.isPinned;
      setOverflowItem(null);
      setActivity((prev) =>
        prev.map((a) => (a.id === item.id ? { ...a, isPinned: newPinned } : a)),
      );
      try {
        const token = await getTokenRef.current();
        await apiPatch(
          `/api/groups/${groupId}/announcements`,
          { id, isPinned: newPinned },
          token,
        );
      } catch {
        setActivity((prev) =>
          prev.map((a) => (a.id === item.id ? { ...a, isPinned: item.isPinned } : a)),
        );
      }
    },
    [groupId],
  );

  // ── Comments ────────────────────────────────────────────────

  const openCommentSheet = useCallback(
    async (item: ActivityItem) => {
      setCommentSheetItem(item);
      setCommentDraft("");
      setComments([]);
      setLoadingComments(true);
      try {
        const token = await getTokenRef.current();
        const annId = rawPostId(item);
        const data = await apiGet<{ comments: CommentItem[] }>(
          `/api/groups/${groupId}/announcements/comments?announcementId=${annId}`,
          token,
        );
        setComments(data.comments);
      } catch {
        // ignore
      } finally {
        setLoadingComments(false);
      }
    },
    [groupId],
  );

  const handlePostComment = useCallback(async () => {
    if (!commentSheetItem) return;
    const body = commentDraft.trim();
    if (!body) return;

    setPostingComment(true);
    try {
      const token = await getTokenRef.current();
      const annId = rawPostId(commentSheetItem);
      const data = await apiPost<{ comment: CommentItem }>(
        `/api/groups/${groupId}/announcements/comments`,
        { announcementId: annId, body },
        token,
      );
      setComments((prev) => [...prev, data.comment]);
      setCommentDraft("");
      setActivity((prev) =>
        prev.map((a) =>
          a.id === commentSheetItem.id
            ? { ...a, commentCount: (a.commentCount ?? 0) + 1 }
            : a,
        ),
      );
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not post comment.");
    } finally {
      setPostingComment(false);
    }
  }, [commentDraft, commentSheetItem, groupId]);

  const handleDeleteComment = useCallback(
    (comment: CommentItem) => {
      if (!commentSheetItem) return;
      Alert.alert("Delete comment", "This cannot be undone.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const token = await getTokenRef.current();
              await apiDelete(
                `/api/groups/${groupId}/announcements/comments?id=${comment.id}`,
                token,
              );
              setComments((prev) => prev.filter((c) => c.id !== comment.id));
              setActivity((prev) =>
                prev.map((a) =>
                  a.id === commentSheetItem.id
                    ? { ...a, commentCount: Math.max(0, (a.commentCount ?? 0) - 1) }
                    : a,
                ),
              );
            } catch (e) {
              Alert.alert("Error", e instanceof Error ? e.message : "Could not delete comment.");
            }
          },
        },
      ]);
    },
    [commentSheetItem, groupId],
  );

  // ── Loading / error states ────────────────────────────────────

  if (loading && !group) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.fairway} />
      </View>
    );
  }

  if (!group) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {loadError ?? "Group not found."}
        </Text>
      </View>
    );
  }

  const isAdmin = apiResolved && (group.myRole === "owner" || group.myRole === "admin");
  const isMember = apiResolved && group.myRole !== null;

  function goToProfile(user: { id: string; name: string; avatar: string | null }) {
    router.push({
      pathname: "/profile/[userId]",
      params: {
        userId: user.id,
        userName: user.name,
        userAvatar: user.avatar ?? "",
      },
    });
  }

  // ── Header ────────────────────────────────────────────────────

  const headerComponent = (
    <View>
      {/* Hero banner */}
      <Pressable
        style={styles.heroBanner}
        onPress={isAdmin ? () => pickAndUploadImage("hero") : undefined}
        disabled={!isAdmin || uploadingImage === "hero"}
      >
        {group.heroImageUrl ? (
          <Image source={group.heroImageUrl} style={styles.heroBannerImage} contentFit="cover" transition={0} />
        ) : (
          <View style={styles.heroBannerFallback}>
            <Ionicons name="golf-outline" size={48} color="rgba(26, 60, 42, 0.12)" />
            {isAdmin ? (
              <View style={styles.heroBannerPrompt}>
                <Ionicons name="camera-outline" size={18} color={colors.muted} />
                <Text style={styles.heroBannerPromptText}>Add cover photo</Text>
              </View>
            ) : null}
          </View>
        )}
        {uploadingImage === "hero" ? (
          <View style={styles.uploadOverlay}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : null}
        {isAdmin && group.heroImageUrl ? (
          <View style={styles.heroCameraBadge}>
            <Ionicons name="camera" size={14} color="#fff" />
          </View>
        ) : null}
      </Pressable>

      {/* Profile row */}
      <View style={styles.profileSection}>
        <Pressable
          style={styles.profileImageWrap}
          onPress={isAdmin ? () => pickAndUploadImage("profile") : undefined}
          disabled={!isAdmin || uploadingImage === "profile"}
        >
          {group.imageUrl ? (
            <Image source={group.imageUrl} style={styles.profileImage} contentFit="cover" transition={0} />
          ) : (
            <InitialAvatar name={group.name ?? "G"} size={82} borderRadius={22} />
          )}
          {uploadingImage === "profile" ? (
            <View style={[styles.uploadOverlay, styles.profileUploadOverlay]}>
              <ActivityIndicator color="#fff" size="small" />
            </View>
          ) : null}
          {isAdmin ? (
            <View style={styles.profileCameraBadge}>
              <Ionicons name="camera" size={10} color="#fff" />
            </View>
          ) : null}
        </Pressable>

        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{group.name}</Text>
          <Text style={styles.profileMeta}>
            {group.joinPolicy === "public"
              ? "Public"
              : group.joinPolicy === "approval"
                ? "Private"
                : "Invite only"}{" "}
            · {group.memberCount} member{group.memberCount !== 1 ? "s" : ""}
          </Text>
        </View>
      </View>

      {group.description ? (
        <Text style={styles.description} numberOfLines={4}>
          {group.description}
        </Text>
      ) : null}

      {/* Join button for non-members (only after API confirms role) */}
      {apiResolved && !isMember && group.joinPolicy === "invite_only" ? (
        <Text style={styles.inviteOnlyNote}>
          This group is invite only. Ask a member to invite you.
        </Text>
      ) : apiResolved && !isMember ? (
        <Pressable style={styles.joinBtn} onPress={handleJoin}>
          <Text style={styles.joinBtnText}>
            {group.joinPolicy === "approval" ? "Request to Join" : "Join Group"}
          </Text>
        </Pressable>
      ) : null}

      {/* Quick actions */}
      {isMember ? (
        <View style={styles.actionsGrid}>
          <Pressable
            style={styles.actionCard}
            onPress={() => {
              if (group.conversationId) {
                router.push({
                  pathname: "/conversation/[id]/chat",
                  params: {
                    id: group.conversationId,
                    chatTitle: group.name,
                    chatAvatars: JSON.stringify(
                      group.imageUrl ? [group.imageUrl] : [],
                    ),
                    chatType: "group",
                  },
                });
              }
            }}
          >
            <View style={styles.actionIconCircle}>
              <Ionicons name="chatbubble-outline" size={20} color={colors.fairway} />
            </View>
            <Text style={styles.actionCardLabel}>Chat</Text>
          </Pressable>

          <Pressable
            style={styles.actionCard}
            onPress={() =>
              router.push({
                pathname: "/group/[groupId]/members",
                params: { groupId: group.id },
              })
            }
          >
            <View style={styles.actionIconCircle}>
              <Ionicons name="people-outline" size={20} color={colors.fairway} />
            </View>
            <Text style={styles.actionCardLabel}>Members</Text>
          </Pressable>

        </View>
      ) : null}

      {/* Facebook-style post composer */}
      {isMember ? (
        <Pressable style={styles.composerRow} onPress={openNewAnnouncement}>
          {meAvatar ? (
            <Image source={toAbsoluteUrl(meAvatar)} style={styles.composerAvatar} transition={0} />
          ) : (
            <View style={[styles.composerAvatar, styles.composerAvatarFallback]}>
              <Ionicons name="person" size={16} color={colors.muted} />
            </View>
          )}
          <View style={styles.composerFakeInput}>
            <Text style={styles.composerPlaceholder}>What's on your mind?</Text>
          </View>
        </Pressable>
      ) : null}

      {isMember && activity.length > 0 ? (
        <Text style={styles.sectionTitle}>Activity</Text>
      ) : null}
    </View>
  );

  // ── Render ────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <FlatList
        data={isMember ? activity : []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={headerComponent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.fairway}
          />
        }
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          if (item.type === "post") {
            const liked = item.viewerLiked ?? false;
            const likeCount = item.likeCount ?? 0;
            const postAuthorAvatar = item.user.avatar;
            return (
              <DoubleTapLikeCard onDoubleTap={() => handleDoubleTapLike(item)}>
              <View style={styles.postCard}>
                <View style={styles.postHeader}>
                  <Pressable style={styles.postAuthorTap} onPress={() => goToProfile(item.user)}>
                    {postAuthorAvatar ? (
                      <Image source={toAbsoluteUrl(postAuthorAvatar)} style={styles.postAvatar} transition={0} />
                    ) : (
                      <InitialAvatar name={item.user.name} size={40} maxInitials={2} />
                    )}
                    <View style={styles.postHeaderText}>
                      <Text style={styles.postAuthor}>{item.user.name}</Text>
                      <Text style={styles.postDate}>
                        {formatRelative(item.createdAt)}
                        {item.isPinned ? "  · Pinned" : ""}
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    style={styles.postOverflow}
                    onPress={() => setOverflowItem(item)}
                    hitSlop={8}
                  >
                    <Ionicons name="ellipsis-horizontal" size={18} color={colors.muted} />
                  </Pressable>
                </View>
                <Text style={styles.postBody}>{item.body}</Text>
                {item.imageUrl ? (
                  <Pressable onPress={() => { setViewerImages([item.imageUrl!]); setViewerVisible(true); }}>
                    <Image
                      source={item.imageUrl}
                      style={styles.postImage}
                      contentFit="cover"
                      transition={0}
                    />
                  </Pressable>
                ) : null}
                <View style={styles.postFooter}>
                  <Pressable
                    style={styles.postLikeBtn}
                    onPress={() => void handleToggleLike(item)}
                  >
                    <Ionicons
                      name={liked ? "heart" : "heart-outline"}
                      size={18}
                      color={liked ? colors.danger : colors.muted}
                    />
                    {likeCount > 0 ? (
                      <Text style={[styles.postLikeCount, liked && styles.postLikeCountActive]}>
                        {likeCount}
                      </Text>
                    ) : null}
                  </Pressable>
                  <Pressable
                    style={styles.postCommentBtn}
                    onPress={() => void openCommentSheet(item)}
                  >
                    <Ionicons name="chatbubble-outline" size={17} color={colors.muted} />
                    {(item.commentCount ?? 0) > 0 ? (
                      <Text style={styles.postCommentCount}>{item.commentCount}</Text>
                    ) : null}
                  </Pressable>
                </View>
              </View>
              </DoubleTapLikeCard>
            );
          }

          if (item.type === "round_created") {
            const token = item.roundToken?.trim();
            const mode =
              item.mode === "planning"
                ? "planning"
                : item.mode === "tournament"
                  ? "tournament"
                  : "scheduled";
            const effectiveIso = item.teeTime ?? item.targetDate ?? item.createdAt;
            return (
              <View style={styles.roundActivityCardWrap}>
                <Text style={styles.roundActivityByline}>
                  <Text style={styles.bold} onPress={() => goToProfile(item.user)}>
                    {item.user.name}
                  </Text>{" "}
                  posted a round
                </Text>
                <Text style={styles.roundActivityTime}>{formatRelative(item.createdAt)}</Text>
                <RoundListCard
                  roundId={item.roundId ?? item.id}
                  mode={mode}
                  courseName={item.courseName ?? null}
                  inviteToken={token}
                  imageUrl={item.imageUrl ?? ""}
                  joinPolicy={item.joinPolicy ?? "instant"}
                  totalSpots={item.totalSpots ?? 4}
                  confirmedPlayers={item.confirmedPlayers ?? []}
                  primaryMeta={
                    mode === "planning"
                      ? formatPlanningWindow(getTimeWindows(item))
                      : formatScheduledCardMeta(effectiveIso, item.teeTime ?? null)
                  }
                  planningLocation={item.planningLocation}
                  planningHeaderDate={formatPlanningHeaderDate(effectiveIso)}
                  preferredTimeWindow={getTimeWindows(item)}
                  onPress={() => {
                    if (token) router.push(`/round/${token}`);
                  }}
                  onPlayerPress={(player) => goToProfile(player)}
                />
              </View>
            );
          }

          if (item.type === "member_joined") {
            const joinAvatar = item.user.avatar;
            return (
              <Pressable style={styles.activityRow} onPress={() => goToProfile(item.user)}>
                {joinAvatar ? (
                  <Image
                    source={toAbsoluteUrl(joinAvatar)}
                    style={styles.activityAvatar}
                    transition={0}
                  />
                ) : (
                  <InitialAvatar name={item.user.name} size={36} maxInitials={2} />
                )}
                <View style={styles.activityInfo}>
                  <Text style={styles.activityText}>
                    <Text style={styles.bold}>{item.user.name}</Text> joined the group
                  </Text>
                  <Text style={styles.activityTime}>
                    {formatRelative(item.joinedAt ?? item.createdAt)}
                  </Text>
                </View>
              </Pressable>
            );
          }

          return null;
        }}
        ListEmptyComponent={
          isMember ? (
            <View style={styles.emptyActivity}>
              <Text style={styles.emptyActivityText}>
                No activity yet. Create a round or start a chat!
              </Text>
            </View>
          ) : null
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.loadingMoreWrap}>
              <ActivityIndicator size="small" color={colors.muted} />
            </View>
          ) : null
        }
      />

      {/* Overflow action sheet for post */}
      <OverflowMenuSheet
        visible={!!overflowItem}
        onClose={() => setOverflowItem(null)}
        items={overflowItem ? [
          ...((overflowItem.user.id === meId || isAdmin) ? [{
            key: "edit",
            label: "Edit post",
            icon: "create-outline" as const,
            onPress: () => openEditAnnouncement(overflowItem),
          }] : []),
          ...(isAdmin ? [{
            key: "pin",
            label: overflowItem.isPinned ? "Unpin post" : "Pin to top",
            onPress: () => void handleTogglePin(overflowItem),
            ...(overflowItem.isPinned
              ? ({ icon: "pin-outline" as const })
              : ({ icon: "pin" as const })),
          }] : []),
          ...((overflowItem.user.id === meId || isAdmin) ? [{
            key: "delete",
            label: "Delete post",
            icon: "trash-outline" as const,
            destructive: true,
            onPress: () => handleDeleteAnnouncement(overflowItem),
          }] : []),
          ...(overflowItem.user.id !== meId ? [{
            key: "report",
            label: "Report post",
            icon: "flag-outline" as const,
            destructive: true,
            onPress: () => {
              const item = overflowItem;
              setTimeout(() => setReportItem(item), 350);
            },
          }] : []),
        ] : []}
      />

      {/* Group overflow sheet */}
      <OverflowMenuSheet
        visible={groupOverflowOpen}
        onClose={() => setGroupOverflowOpen(false)}
        items={[
          {
            key: "share",
            label: "Share group",
            icon: "share-outline" as const,
            onPress: () => {
              if (!group) return;
              const url = `${publicWebOrigin}/groups/${group.id}`;
              void Share.share({
                message: `Check out ${group.name} on Parfade: ${url}`,
              });
            },
          },
          ...(isMember
            ? [
                {
                  key: "mute-push",
                  label: group?.myMuteGroupPush ? "Unmute group push" : "Mute group push",
                  icon: (group?.myMuteGroupPush
                    ? "notifications-outline"
                    : "notifications-off-outline") as const,
                  onPress: () => void handleToggleGroupPushMute(),
                },
              ]
            : []),
          ...(isAdmin
            ? [
                {
                  key: "settings",
                  label: "Group settings",
                  icon: "settings-outline" as const,
                  onPress: () => {
                    if (!group) return;
                    router.push({
                      pathname: "/group/[groupId]/settings" as const,
                      params: { groupId: group.id },
                    });
                  },
                },
              ]
            : []),
        ]}
      />

      {/* Comments bottom sheet (Instagram-style) */}
      <AnimatedBottomSheetFrame
        visible={!!commentSheetItem}
        onClose={() => {
          Keyboard.dismiss();
          setCommentSheetItem(null);
          setComments([]);
          setCommentDraft("");
        }}
        snapPoints={COMMENT_SNAP_POINTS}
        sheetStyle={styles.commentSheetContent}
        keyboardBlurBehavior="restore"
        enableContentPanningGesture={false}
        dragHandle
      >
        <Text style={styles.commentSheetTitle}>Comments</Text>
        <BottomSheetScrollView
          style={styles.commentScroll}
          contentContainerStyle={styles.commentScrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {loadingComments ? (
            <ActivityIndicator
              color={colors.fairway}
              size="small"
              style={{ marginVertical: 24 }}
            />
          ) : comments.length === 0 ? (
            <Text style={styles.commentEmpty}>No comments yet. Be the first!</Text>
          ) : (
            comments.map((comment) => {
              const commentAvatar = comment.user.avatar;
              return (
              <View key={comment.id} style={styles.commentRow}>
                <Pressable onPress={() => goToProfile(comment.user)}>
                  {commentAvatar ? (
                    <Image source={toAbsoluteUrl(commentAvatar)} style={styles.commentAvatar} transition={0} />
                  ) : (
                    <InitialAvatar name={comment.user.name} size={32} maxInitials={2} />
                  )}
                </Pressable>
                <View style={styles.commentContent}>
                  <View style={styles.commentBubble}>
                    <Text style={styles.commentAuthor} onPress={() => goToProfile(comment.user)}>{comment.user.name}</Text>
                    <Text style={styles.commentBody}>{comment.body}</Text>
                  </View>
                  <View style={styles.commentMetaRow}>
                    <Text style={styles.commentTime}>{formatRelative(comment.createdAt)}</Text>
                    {(comment.user.id === meId || isAdmin) ? (
                      <Pressable
                        onPress={() => handleDeleteComment(comment)}
                        hitSlop={8}
                      >
                        <Text style={styles.commentDeleteText}>Delete</Text>
                      </Pressable>
                    ) : null}
                    {comment.user.id !== meId ? (
                      <Pressable
                        onPress={() => setReportComment(comment)}
                        hitSlop={8}
                      >
                        <Text style={styles.commentDeleteText}>Report</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </View>
              );
            })
          )}
        </BottomSheetScrollView>
        <View style={styles.commentInputRow}>
          {meAvatar ? (
            <Image source={toAbsoluteUrl(meAvatar)} style={styles.commentInputAvatar} transition={0} />
          ) : (
            <View style={[styles.commentInputAvatar, styles.commentAvatarFallback]}>
              <Ionicons name="person" size={12} color={colors.muted} />
            </View>
          )}
          <BottomSheetTextInput
            ref={commentInputRef}
            style={styles.commentInput}
            value={commentDraft}
            onChangeText={setCommentDraft}
            placeholder="Add a comment..."
            placeholderTextColor={colors.muted}
            maxLength={2000}
            returnKeyType="send"
            onSubmitEditing={() => void handlePostComment()}
          />
          <Pressable
            onPress={() => void handlePostComment()}
            disabled={!commentDraft.trim() || postingComment}
            hitSlop={6}
          >
            {postingComment ? (
              <ActivityIndicator color={colors.fairway} size="small" />
            ) : (
              <Ionicons
                name="send"
                size={20}
                color={commentDraft.trim() ? colors.fairway : colors.muted}
              />
            )}
          </Pressable>
        </View>
      </AnimatedBottomSheetFrame>

      <ReportSheet
        visible={!!reportItem}
        onClose={() => setReportItem(null)}
        contentType="post"
        contentId={reportItem?.id ?? ""}
        targetUserId={reportItem?.user.id}
        targetLabel="this post"
      />
      <ReportSheet
        visible={!!reportComment}
        onClose={() => setReportComment(null)}
        contentType="comment"
        contentId={reportComment?.id ?? ""}
        targetUserId={reportComment?.user.id}
        targetLabel="this comment"
      />
      <FullscreenImageViewer
        images={viewerImages}
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
      />
    </View>
  );
}

function DoubleTapLikeCard({
  children,
  onDoubleTap,
}: {
  children: React.ReactNode;
  onDoubleTap: () => void;
}) {
  const heartScale = useSharedValue(0);
  const heartOpacity = useSharedValue(0);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      runOnJS(onDoubleTap)();
      heartScale.value = withSequence(
        withTiming(1.2, { duration: 180 }),
        withTiming(1, { duration: 100 }),
      );
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
      <View style={doubleTapStyles.wrapper}>
        {children}
        <Reanimated.View
          style={[doubleTapStyles.heartOverlay, heartAnimStyle]}
          pointerEvents="none"
        >
          <Ionicons name="heart" size={64} color={colors.danger} />
        </Reanimated.View>
      </View>
    </GestureDetector>
  );
}

const doubleTapStyles = StyleSheet.create({
  wrapper: { position: "relative" },
  heartOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
});

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const HERO_ASPECT = 16 / 9;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  errorText: { color: colors.muted, fontSize: 15 },
  list: { paddingBottom: 40 },

  // ── Hero banner ────────────────────────────────────────────
  heroBanner: {
    width: "100%",
    aspectRatio: HERO_ASPECT,
    backgroundColor: colors.fairwaySoft,
    position: "relative",
  },
  heroBannerImage: {
    width: "100%",
    height: "100%",
  },
  heroBannerFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#dfe6df",
    gap: 8,
  },
  heroBannerPrompt: {
    alignItems: "center",
    gap: 4,
  },
  heroBannerPromptText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroCameraBadge: {
    position: "absolute",
    bottom: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.5)",
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Profile section ────────────────────────────────────────
  profileSection: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginTop: -36,
    gap: 12,
  },
  profileImageWrap: {
    position: "relative",
  },
  profileImage: {
    width: 82,
    height: 82,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: colors.background,
    backgroundColor: colors.surface,
  },
  profileImageFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.fairwaySoft,
  },
  profileUploadOverlay: {
    borderRadius: 22,
  },
  profileCameraBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    backgroundColor: colors.fairway,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.background,
  },
  profileInfo: {
    flex: 1,
    paddingTop: 44,
    gap: 2,
  },
  profileName: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 20,
  },
  profileMeta: {
    color: colors.muted,
    fontSize: 13,
  },
  description: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 16,
    marginTop: 8,
  },

  // ── Join ───────────────────────────────────────────────────
  joinBtn: {
    backgroundColor: colors.fairway,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 14,
    marginHorizontal: 16,
  },
  joinBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  inviteOnlyNote: {
    color: colors.muted,
    fontSize: 14,
    textAlign: "center",
    marginTop: 14,
    marginHorizontal: 16,
    lineHeight: 20,
  },

  // ── Quick actions (grid) ───────────────────────────────────
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  actionCard: {
    flexBasis: "47%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.fairwaySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  actionCardLabel: {
    color: colors.text,
    fontWeight: "600",
    fontSize: 14,
  },

  // ── Post composer row ──────────────────────────────────────
  composerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  composerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  composerAvatarFallback: {
    backgroundColor: colors.fairwaySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  composerFakeInput: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  composerPlaceholder: {
    color: colors.muted,
    fontSize: 14,
  },

  // ── Activity ───────────────────────────────────────────────
  sectionTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 15,
    paddingHorizontal: 16,
    marginTop: 24,
    marginBottom: 8,
  },
  // ── Post card (Facebook-style) ──────────────────────────────
  postCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
  },
  postAuthorTap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  postAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  postAvatarFallback: {
    backgroundColor: colors.fairwaySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  postHeaderText: {
    flex: 1,
    gap: 1,
  },
  postAuthor: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 15,
  },
  postDate: {
    color: colors.muted,
    fontSize: 12,
  },
  postOverflow: {
    padding: 4,
    marginTop: -2,
    marginRight: -4,
  },
  postBody: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  postImage: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: 10,
    marginTop: 10,
    backgroundColor: colors.fairwaySoft,
  },
  postFooter: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  postLikeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 2,
    paddingRight: 12,
  },
  postLikeCount: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  postLikeCountActive: {
    color: colors.danger,
  },
  postCommentBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 2,
    paddingRight: 12,
  },
  postCommentCount: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
  },

  // ── Comments bottom sheet ─────────────────────────────────
  commentSheetContent: {
    paddingHorizontal: 0,
    paddingBottom: 4,
  },
  commentSheetTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 16,
    textAlign: "center",
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  commentScroll: {
    flex: 1,
  },
  commentScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  commentEmpty: {
    color: colors.muted,
    fontSize: 14,
    textAlign: "center",
    marginTop: 32,
  },
  commentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 16,
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  commentAvatarFallback: {
    backgroundColor: colors.fairwaySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  commentContent: {
    flex: 1,
    gap: 4,
  },
  commentBubble: {
    backgroundColor: colors.background,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  commentAuthor: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 13,
  },
  commentBody: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 19,
    marginTop: 2,
  },
  commentMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingLeft: 4,
  },
  commentTime: {
    color: colors.muted,
    fontSize: 12,
  },
  commentDeleteText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  commentInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  commentInputAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  commentInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },

  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  activityAvatar: { width: 36, height: 36, borderRadius: 18 },
  activityAvatarFallback: {
    backgroundColor: colors.fairwaySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  activityInfo: { flex: 1, gap: 2 },
  activityText: { color: colors.text, fontSize: 14 },
  activityTime: { color: colors.muted, fontSize: 12 },
  roundActivityCardWrap: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  roundActivityByline: {
    color: colors.text,
    fontSize: 14,
  },
  roundActivityTime: {
    color: colors.muted,
    fontSize: 12,
  },
  bold: { fontWeight: "600" },
  loadingMoreWrap: {
    paddingVertical: 20,
    alignItems: "center",
  },
  emptyActivity: {
    alignItems: "center",
    paddingTop: 40,
    paddingHorizontal: 40,
  },
  emptyActivityText: {
    color: colors.muted,
    fontSize: 14,
    textAlign: "center",
  },

});
