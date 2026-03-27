import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { AnimatedBottomSheetFrame, BottomSheetScrollView, BottomSheetTextInput } from "../../../components/animated-bottom-sheet-frame";
import { InitialAvatar } from "../../../components/initial-avatar";
import { OverflowMenuSheet, type OverflowMenuItem } from "../../../components/overflow-menu-sheet";
import { ReportSheet } from "../../../components/report-sheet";
import { apiDelete, apiGet, apiPatch, apiPost, publicWebOrigin } from "../../../lib/api";
import { hapticLight } from "../../../lib/haptics";
import { getCachedMeProfile, subscribeMeProfile } from "../../../lib/me-profile-cache";
import { uploadImage, AVATAR_MAX_BYTES, COVER_MAX_BYTES, POST_MAX_BYTES } from "../../../lib/upload-image";
import { FullscreenImageViewer } from "../../../components/fullscreen-image-viewer";
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
  courseName?: string | null;
  targetDate?: string;
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

  // Announcement bottom sheet
  const [showAnnounceSheet, setShowAnnounceSheet] = useState(false);
  const [announceDraft, setAnnounceDraft] = useState("");
  const [editingAnnouncement, setEditingAnnouncement] = useState<{ id: string; body: string } | null>(null);
  const [postingAnnouncement, setPostingAnnouncement] = useState(false);

  // Image upload
  const [uploadingImage, setUploadingImage] = useState<"profile" | "hero" | null>(null);

  // Post image attachment
  const [postImageUri, setPostImageUri] = useState<string | null>(null);
  const [uploadingPostImage, setUploadingPostImage] = useState(false);

  const [overflowItem, setOverflowItem] = useState<ActivityItem | null>(null);
  const [reportItem, setReportItem] = useState<ActivityItem | null>(null);
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
        void load({ silent: true });
      } else if (data.status === "requested") {
        Alert.alert("Request sent", "An admin will review your request.");
      }
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not join.");
    }
  }, [groupId, load]);

  // ── Announcements ─────────────────────────────────────────────

  const openNewAnnouncement = useCallback(() => {
    setEditingAnnouncement(null);
    setAnnounceDraft("");
    setPostImageUri(null);
    setShowAnnounceSheet(true);
  }, []);

  const rawPostId = (item: ActivityItem) => item.id.replace(/^(post|ann)-/, "");

  const openEditAnnouncement = useCallback((item: ActivityItem) => {
    setOverflowItem(null);
    setEditingAnnouncement({ id: rawPostId(item), body: item.body ?? "" });
    setAnnounceDraft(item.body ?? "");
    setPostImageUri(item.imageUrl ?? null);
    setShowAnnounceSheet(true);
  }, []);

  const pickPostImage = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Photo library access is needed to attach images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setPostImageUri(result.assets[0].uri);
    }
  }, []);

  const uploadPostImage = useCallback(async (localUri: string): Promise<string | null> => {
    setUploadingPostImage(true);
    try {
      const url = await uploadImage({
        uri: localUri,
        filename: "post-image.jpg",
        maxBytes: POST_MAX_BYTES,
        getToken: getTokenRef.current,
      });
      return url;
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Could not upload image.");
      return null;
    } finally {
      setUploadingPostImage(false);
    }
  }, []);

  const handlePostOrEditAnnouncement = useCallback(async () => {
    const body = announceDraft.trim();
    if (!body) return;
    setPostingAnnouncement(true);
    try {
      const token = await getTokenRef.current();

      let imageUrl: string | null | undefined;
      if (postImageUri && postImageUri.startsWith("http")) {
        imageUrl = postImageUri;
      } else if (postImageUri) {
        const uploaded = await uploadPostImage(postImageUri);
        if (!uploaded) {
          setPostingAnnouncement(false);
          return;
        }
        imageUrl = uploaded;
      } else {
        imageUrl = editingAnnouncement ? null : undefined;
      }

      if (editingAnnouncement) {
        await apiPatch(
          `/api/groups/${groupId}/announcements`,
          { id: editingAnnouncement.id, body, imageUrl },
          token,
        );
      } else {
        await apiPost(`/api/groups/${groupId}/announcements`, { body, imageUrl }, token);
      }
      setAnnounceDraft("");
      setEditingAnnouncement(null);
      setPostImageUri(null);
      setShowAnnounceSheet(false);
      void load({ silent: true });
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not post.");
    } finally {
      setPostingAnnouncement(false);
    }
  }, [announceDraft, editingAnnouncement, groupId, load, postImageUri, uploadPostImage]);

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
              void load({ silent: true });
            } catch (e) {
              Alert.alert("Error", e instanceof Error ? e.message : "Could not delete.");
            }
          },
        },
      ]);
    },
    [groupId, load],
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
        void load({ silent: true });
      } catch {
        setActivity((prev) =>
          prev.map((a) => (a.id === item.id ? { ...a, isPinned: item.isPinned } : a)),
        );
      }
    },
    [groupId, load],
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
      params: { userId: user.id, userName: user.name, userAvatar: user.avatar ?? "" },
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
            <Image source={meAvatar} style={styles.composerAvatar} transition={0} />
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
            return (
              <View style={styles.postCard}>
                <View style={styles.postHeader}>
                  <Pressable style={styles.postAuthorTap} onPress={() => goToProfile(item.user)}>
                    {item.user.avatar ? (
                      <Image source={item.user.avatar} style={styles.postAvatar} transition={0} />
                    ) : (
                      <View style={[styles.postAvatar, styles.postAvatarFallback]}>
                        <Ionicons name="person" size={16} color={colors.muted} />
                      </View>
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
            );
          }

          if (item.type === "round_created") {
            return (
              <Pressable
                style={styles.activityRow}
                onPress={() => {
                  if (item.roundId) {
                    router.push(`/round/${item.roundId}`);
                  }
                }}
              >
                <Pressable onPress={() => goToProfile(item.user)}>
                  {item.user.avatar ? (
                    <Image
                      source={item.user.avatar}
                      style={styles.activityAvatar}
                      transition={0}
                    />
                  ) : (
                    <View style={[styles.activityAvatar, styles.activityAvatarFallback]}>
                      <Ionicons name="person" size={14} color={colors.muted} />
                    </View>
                  )}
                </Pressable>
                <View style={styles.activityInfo}>
                  <Text style={styles.activityText}>
                    <Text style={styles.bold} onPress={() => goToProfile(item.user)}>{item.user.name}</Text> created a round
                    {item.courseName ? ` at ${item.courseName}` : ""}
                  </Text>
                  <Text style={styles.activityTime}>
                    {formatRelative(item.createdAt)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.muted} />
              </Pressable>
            );
          }

          if (item.type === "member_joined") {
            return (
              <Pressable style={styles.activityRow} onPress={() => goToProfile(item.user)}>
                {item.user.avatar ? (
                  <Image
                    source={item.user.avatar}
                    style={styles.activityAvatar}
                    transition={0}
                  />
                ) : (
                  <View style={[styles.activityAvatar, styles.activityAvatarFallback]}>
                    <Ionicons name="person" size={14} color={colors.muted} />
                  </View>
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

      {/* Post / Edit Announcement bottom sheet */}
      <AnimatedBottomSheetFrame
        visible={showAnnounceSheet}
        onClose={() => {
          Keyboard.dismiss();
          setShowAnnounceSheet(false);
          setEditingAnnouncement(null);
          setAnnounceDraft("");
          setPostImageUri(null);
        }}
        sheetStyle={styles.announceSheetContent}
      >
        <Text style={styles.sheetTitle}>
          {editingAnnouncement ? "Edit post" : "Create a post"}
        </Text>
        <BottomSheetTextInput
          style={styles.sheetInput}
          value={announceDraft}
          onChangeText={setAnnounceDraft}
          placeholder="What's on your mind?"
          placeholderTextColor={colors.muted}
          multiline
          numberOfLines={4}
          maxLength={2000}
          autoFocus
        />
        {postImageUri ? (
          <View style={styles.sheetImagePreviewWrap}>
            <Image source={postImageUri} style={styles.sheetImagePreview} transition={0} />
            <Pressable
              style={styles.sheetImageRemove}
              onPress={() => setPostImageUri(null)}
              hitSlop={6}
            >
              <Ionicons name="close-circle" size={22} color="rgba(0,0,0,0.7)" />
            </Pressable>
          </View>
        ) : null}
        <View style={styles.sheetActions}>
          <Pressable
            style={styles.sheetImageBtn}
            onPress={() => void pickPostImage()}
            disabled={uploadingPostImage}
          >
            <Ionicons name="image-outline" size={22} color={colors.fairway} />
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable
            style={styles.sheetCancel}
            onPress={() => {
              Keyboard.dismiss();
              setShowAnnounceSheet(false);
              setEditingAnnouncement(null);
              setAnnounceDraft("");
              setPostImageUri(null);
            }}
          >
            <Text style={styles.sheetCancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[
              styles.sheetPost,
              (!announceDraft.trim() || postingAnnouncement) && styles.sheetPostDisabled,
            ]}
            onPress={handlePostOrEditAnnouncement}
            disabled={!announceDraft.trim() || postingAnnouncement}
          >
            {postingAnnouncement ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.sheetPostText}>
                {editingAnnouncement ? "Save" : "Post"}
              </Text>
            )}
          </Pressable>
        </View>
      </AnimatedBottomSheetFrame>

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
            icon: (overflowItem.isPinned ? "pin-outline" : "pin") as const,
            onPress: () => void handleTogglePin(overflowItem),
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
            comments.map((comment) => (
              <View key={comment.id} style={styles.commentRow}>
                <Pressable onPress={() => goToProfile(comment.user)}>
                  {comment.user.avatar ? (
                    <Image source={comment.user.avatar} style={styles.commentAvatar} transition={0} />
                  ) : (
                    <View style={[styles.commentAvatar, styles.commentAvatarFallback]}>
                      <Ionicons name="person" size={12} color={colors.muted} />
                    </View>
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
                  </View>
                </View>
              </View>
            ))
          )}
        </BottomSheetScrollView>
        <View style={styles.commentInputRow}>
          {meAvatar ? (
            <Image source={meAvatar} style={styles.commentInputAvatar} transition={0} />
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
      <FullscreenImageViewer
        images={viewerImages}
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
      />
    </View>
  );
}

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

  // ── Announce bottom sheet ──────────────────────────────────
  announceSheetContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sheetTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 18,
    marginBottom: 12,
  },
  sheetInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: colors.text,
    minHeight: 100,
    textAlignVertical: "top",
  },
  sheetImagePreviewWrap: {
    marginTop: 10,
    position: "relative",
    alignSelf: "flex-start",
  },
  sheetImagePreview: {
    width: 120,
    height: 90,
    borderRadius: 8,
    backgroundColor: colors.fairwaySoft,
  },
  sheetImageRemove: {
    position: "absolute",
    top: -6,
    right: -6,
  },
  sheetImageBtn: {
    padding: 8,
  },
  sheetActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 12,
  },
  sheetCancel: { paddingVertical: 10, paddingHorizontal: 16 },
  sheetCancelText: { color: colors.muted, fontWeight: "600", fontSize: 15 },
  sheetPost: {
    backgroundColor: colors.fairway,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  sheetPostDisabled: { opacity: 0.5 },
  sheetPostText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
