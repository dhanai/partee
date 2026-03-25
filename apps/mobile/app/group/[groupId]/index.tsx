import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AnimatedBottomSheetFrame } from "../../../components/animated-bottom-sheet-frame";
import { apiDelete, apiGet, apiPatch, apiPost, apiBaseUrl } from "../../../lib/api";
import { getCachedMeProfile } from "../../../lib/me-profile-cache";
import { compressImageToJpegUriForUpload, compressImageToMaxBytes } from "../../../lib/compress-image-for-upload";
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
  type: "announcement" | "round_created" | "member_joined";
  id: string;
  body?: string;
  imageUrl?: string | null;
  isPinned?: boolean;
  likeCount?: number;
  viewerLiked?: boolean;
  createdAt: string;
  joinedAt?: string;
  roundId?: string;
  courseName?: string | null;
  targetDate?: string;
  user: { id: string; name: string; avatar: string | null };
};

const MAX_IMG_BYTES = 3 * 1024 * 1024;

export default function GroupLandingScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  // Overflow action sheet for announcements
  const [overflowItem, setOverflowItem] = useState<ActivityItem | null>(null);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const token = await getTokenRef.current();
        const [groupData, activityData] = await Promise.all([
          apiGet<{ group: GroupDetail }>(`/api/groups/${groupId}`, token),
          apiGet<{ activity: ActivityItem[] }>(`/api/groups/${groupId}/activity`, token),
        ]);
        setGroup(groupData.group);
        setActivity(activityData.activity);
      } catch {
        // ignore
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [groupId],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (!group) return;
    const isAdmin = group.myRole === "owner" || group.myRole === "admin";
    navigation.setOptions({
      title: group.name,
      headerRight: () =>
        isAdmin ? (
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/group/[groupId]/settings",
                params: { groupId: group.id },
              })
            }
            hitSlop={8}
            accessibilityLabel="Group settings"
          >
            <Ionicons name="settings-outline" size={22} color={colors.fairway} />
          </Pressable>
        ) : null,
      headerRightContainerStyle: { paddingRight: 12 },
    });
  }, [navigation, router, group]);

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
        const token = await getTokenRef.current();
        const asset = result.assets[0];
        const formData = new FormData();

        if (Platform.OS === "web") {
          const imageBlob = await compressImageToMaxBytes(asset.uri, MAX_IMG_BYTES, asset.width, asset.height);
          formData.append("file", imageBlob, `group-${kind}.jpg`);
        } else {
          const fileUri = await compressImageToJpegUriForUpload(asset.uri, MAX_IMG_BYTES, asset.width, asset.height);
          formData.append("file", {
            uri: fileUri,
            name: `group-${kind}.jpg`,
            type: "image/jpeg",
          } as unknown as Blob);
        }

        const response = await fetch(`${apiBaseUrl}/api/uploads/event-image`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          body: formData,
        });
        const json = await response.json() as { url?: string; error?: string };
        if (!response.ok || !json.url) {
          throw new Error(json.error ?? "Upload failed.");
        }

        const patch: Record<string, string | null> = {};
        if (isProfile) patch.imageUrl = json.url;
        else patch.heroImageUrl = json.url;

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

  const rawAnnouncementId = (item: ActivityItem) => item.id.replace(/^ann-/, "");

  const openEditAnnouncement = useCallback((item: ActivityItem) => {
    setOverflowItem(null);
    setEditingAnnouncement({ id: rawAnnouncementId(item), body: item.body ?? "" });
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
      const token = await getTokenRef.current();
      const formData = new FormData();

      if (Platform.OS === "web") {
        const imageBlob = await compressImageToMaxBytes(localUri, MAX_IMG_BYTES, 0, 0);
        formData.append("file", imageBlob, "post-image.jpg");
      } else {
        const fileUri = await compressImageToJpegUriForUpload(localUri, MAX_IMG_BYTES, 0, 0);
        formData.append("file", {
          uri: fileUri,
          name: "post-image.jpg",
          type: "image/jpeg",
        } as unknown as Blob);
      }

      const response = await fetch(`${apiBaseUrl}/api/uploads/event-image`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });
      const json = await response.json() as { url?: string; error?: string };
      if (!response.ok || !json.url) throw new Error(json.error ?? "Upload failed.");
      return json.url;
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
      const id = rawAnnouncementId(item);
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
      const id = rawAnnouncementId(item);
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
      const id = rawAnnouncementId(item);
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
        <Text style={styles.errorText}>Group not found.</Text>
      </View>
    );
  }

  const isAdmin = group.myRole === "owner" || group.myRole === "admin";
  const isMember = group.myRole !== null;

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
          <Image source={{ uri: group.heroImageUrl }} style={styles.heroBannerImage} />
        ) : (
          <View style={styles.heroBannerFallback}>
            {isAdmin ? (
              <View style={styles.heroBannerPrompt}>
                <Ionicons name="image-outline" size={24} color={colors.muted} />
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
            <Image source={{ uri: group.imageUrl }} style={styles.profileImage} />
          ) : (
            <View style={[styles.profileImage, styles.profileImageFallback]}>
              <Ionicons name="people" size={28} color={colors.muted} />
            </View>
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

      {/* Join button for non-members */}
      {!isMember && group.joinPolicy !== "invite_only" ? (
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
                  params: { id: group.conversationId },
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
          {(() => {
            const me = getCachedMeProfile();
            return me?.avatar ? (
              <Image source={{ uri: me.avatar }} style={styles.composerAvatar} />
            ) : (
              <View style={[styles.composerAvatar, styles.composerAvatarFallback]}>
                <Ionicons name="person" size={16} color={colors.muted} />
              </View>
            );
          })()}
          <View style={styles.composerFakeInput}>
            <Text style={styles.composerPlaceholder}>What's on your mind?</Text>
          </View>
        </Pressable>
      ) : null}

      {activity.length > 0 ? (
        <Text style={styles.sectionTitle}>Activity</Text>
      ) : null}
    </View>
  );

  // ── Render ────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <FlatList
        data={activity}
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
          if (item.type === "announcement") {
            const liked = item.viewerLiked ?? false;
            const likeCount = item.likeCount ?? 0;
            return (
              <View style={styles.postCard}>
                <View style={styles.postHeader}>
                  {item.user.avatar ? (
                    <Image source={{ uri: item.user.avatar }} style={styles.postAvatar} />
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
                  {(isAdmin || item.user.id === getCachedMeProfile()?.id) ? (
                    <Pressable
                      style={styles.postOverflow}
                      onPress={() => setOverflowItem(item)}
                      hitSlop={8}
                    >
                      <Ionicons name="ellipsis-horizontal" size={18} color={colors.muted} />
                    </Pressable>
                  ) : null}
                </View>
                <Text style={styles.postBody}>{item.body}</Text>
                {item.imageUrl ? (
                  <Image
                    source={{ uri: item.imageUrl }}
                    style={styles.postImage}
                    resizeMode="cover"
                  />
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
                {item.user.avatar ? (
                  <Image
                    source={{ uri: item.user.avatar }}
                    style={styles.activityAvatar}
                  />
                ) : (
                  <View style={[styles.activityAvatar, styles.activityAvatarFallback]}>
                    <Ionicons name="person" size={14} color={colors.muted} />
                  </View>
                )}
                <View style={styles.activityInfo}>
                  <Text style={styles.activityText}>
                    <Text style={styles.bold}>{item.user.name}</Text> created a round
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
              <View style={styles.activityRow}>
                {item.user.avatar ? (
                  <Image
                    source={{ uri: item.user.avatar }}
                    style={styles.activityAvatar}
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
              </View>
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
      />

      {/* Post / Edit Announcement bottom sheet */}
      <AnimatedBottomSheetFrame
        visible={showAnnounceSheet}
        onClose={() => {
          setShowAnnounceSheet(false);
          setEditingAnnouncement(null);
          setAnnounceDraft("");
          setPostImageUri(null);
        }}
        sheetStyle={styles.announceSheet}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={60}
        >
          <Text style={styles.sheetTitle}>
            {editingAnnouncement ? "Edit post" : "Create a post"}
          </Text>
          <TextInput
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
              <Image source={{ uri: postImageUri }} style={styles.sheetImagePreview} />
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
        </KeyboardAvoidingView>
      </AnimatedBottomSheetFrame>

      {/* Overflow action sheet for post */}
      <AnimatedBottomSheetFrame
        visible={!!overflowItem}
        onClose={() => setOverflowItem(null)}
        sheetStyle={styles.overflowSheet}
      >
        {overflowItem ? (
          <View style={styles.overflowActions}>
            {(overflowItem.user.id === getCachedMeProfile()?.id || isAdmin) ? (
              <Pressable
                style={styles.overflowRow}
                onPress={() => openEditAnnouncement(overflowItem)}
              >
                <Ionicons name="create-outline" size={20} color={colors.text} />
                <Text style={styles.overflowRowText}>Edit post</Text>
              </Pressable>
            ) : null}
            {isAdmin ? (
              <Pressable
                style={styles.overflowRow}
                onPress={() => void handleTogglePin(overflowItem)}
              >
                <Ionicons
                  name={overflowItem.isPinned ? "pin-outline" : "pin"}
                  size={20}
                  color={colors.text}
                />
                <Text style={styles.overflowRowText}>
                  {overflowItem.isPinned ? "Unpin post" : "Pin to top"}
                </Text>
              </Pressable>
            ) : null}
            {(overflowItem.user.id === getCachedMeProfile()?.id || isAdmin) ? (
              <Pressable
                style={styles.overflowRow}
                onPress={() => handleDeleteAnnouncement(overflowItem)}
              >
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
                <Text style={[styles.overflowRowText, { color: colors.danger }]}>Delete post</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </AnimatedBottomSheetFrame>
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
    resizeMode: "cover",
  },
  heroBannerFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
  announceSheet: {
    paddingHorizontal: 20,
    paddingTop: 16,
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

  // ── Overflow action sheet ─────────────────────────────────
  overflowSheet: {
    paddingHorizontal: 8,
  },
  overflowActions: {
    gap: 2,
  },
  overflowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  overflowRowText: {
    color: colors.text,
    fontWeight: "600",
    fontSize: 16,
  },
});
