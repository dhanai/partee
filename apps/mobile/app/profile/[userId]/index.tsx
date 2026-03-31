import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import {
  AnimatedBottomSheetFrame,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "../../../components/animated-bottom-sheet-frame";
import { FullscreenImageViewer } from "../../../components/fullscreen-image-viewer";
import { InitialAvatar } from "../../../components/initial-avatar";
import { OverflowMenuSheet } from "../../../components/overflow-menu-sheet";
import { ParfadeProfileLiveRefresh } from "../../../components/parfade-profile-live-refresh";
import { RoundListCard } from "../../../components/round-list-card";
import { ReportSheet } from "../../../components/report-sheet";
import { hapticSuccess } from "../../../lib/haptics";
import { claimRsvpButtonStyles as btn } from "../../../lib/claim-rsvp-button-styles";
import { formatProfileNavTitle } from "../../../lib/format-profile-nav-title";
import { useAblyChatMounted } from "../../../lib/ably-chat-context";
import { apiDelete, apiGet, apiPatch, apiPost, publicWebOrigin, toAbsoluteUrl } from "../../../lib/api";
import {
  formatPlanningHeaderDate,
  formatPlanningWindow,
  formatScheduledCardMeta,
  getTimeWindows,
  resolveTournamentTitle,
} from "../../../lib/round-card-meta";
import { buildRoundListHint, prefetchRoundOpen } from "../../../lib/round-details-cache";
import {
  fetchPublicProfileAndCache,
  getCachedPublicProfile,
  PublicProfile,
  setCachedPublicProfile,
} from "../../../lib/public-profile-cache";
import { colors } from "../../../lib/theme";
import type { MineRound } from "../../../types/round";

const AVATAR_RADIUS = 28;
type ProfilePost = {
  id: string;
  body: string;
  imageUrl: string | null;
  createdAt: string;
  isPinned?: boolean;
  likeCount?: number;
  commentCount?: number;
  viewerLiked?: boolean;
  user: { id: string; name: string; avatar: string | null };
};
type ProfileRound = {
  id: string;
  inviteToken: string;
  createdAt: string;
  courseName: string | null;
  tournamentTitle: string | null;
  mode: "scheduled" | "planning" | "tournament";
  teeTime: string | null;
  targetDate: string;
  imageUrl: string;
  totalSpots: number;
  spotsRemaining: number;
  joinPolicy: "instant" | "approval";
  preferredTimeWindow: string | null;
  preferredTimeWindows: string[] | null;
  planningLocation: string | null;
  confirmedPlayers: Array<{ id: string; name: string; avatar: string | null }>;
  source: "hosting" | "joined";
};
type ProfileRoundsResponse = {
  rounds?: Omit<ProfileRound, "source">[];
  hosting?: Omit<ProfileRound, "source">[];
  joined?: Omit<ProfileRound, "source">[];
};
type ProfileFeedItem =
  | { kind: "round"; id: string; ts: number; round: ProfileRound }
  | { kind: "post"; id: string; ts: number; post: ProfilePost };
type ProfileComment = {
  id: string;
  body: string;
  createdAt: string;
  user: { id: string; name: string; avatar: string | null };
};

const COMMENT_SNAP_POINTS = ["55%"] as const;

function toMineRoundForHint(r: ProfileRound): MineRound {
  return {
    id: r.id,
    inviteToken: r.inviteToken,
    courseName: r.courseName,
    tournamentTitle: r.tournamentTitle ?? null,
    teeTime: r.teeTime,
    targetDate: r.targetDate,
    mode: r.mode,
    preferredTimeWindow: r.preferredTimeWindow,
    preferredTimeWindows: r.preferredTimeWindows,
    planningLocation: r.planningLocation,
    status: "forming",
    joinPolicy: r.joinPolicy,
    imageUrl: r.imageUrl,
    totalSpots: r.totalSpots,
    spotsRemaining: r.spotsRemaining,
    confirmedPlayers: r.confirmedPlayers,
  };
}

/**
 * Route params carry the name/avatar from the list row you tapped (fresh).
 * The in-memory cache can still hold an older profile — prefer params over cache for those fields,
 * while keeping cached relationship / counts / friends until the network returns.
 */
function computeBootstrapProfile(
  userId: string | undefined,
  userName: string | string[] | undefined,
  userAvatar: string | string[] | undefined,
): PublicProfile | null {
  if (!userId) return null;
  const cached = getCachedPublicProfile(userId);
  const rawName = Array.isArray(userName) ? userName[0] : userName;
  const rawAvatar = Array.isArray(userAvatar) ? userAvatar[0] : userAvatar;
  const hasName = typeof rawName === "string" && rawName.trim().length > 0;
  const hasAvatar = typeof rawAvatar === "string" && rawAvatar.trim().length > 0;
  const avatarForBootstrap = hasAvatar ? rawAvatar.trim() : null;

  if (!cached) {
    if (!hasName && !hasAvatar) return null;
    return {
      user: {
        id: userId,
        name: hasName ? rawName.trim() : "Profile",
        avatar: avatarForBootstrap,
        handicap: null,
        location: null,
        followVisibility: "public",
        relationship: "none",
        followersCount: 0,
        followingCount: 0,
      },
      friends: [],
    };
  }

  if (!hasName && !hasAvatar) return cached;

  return {
    ...cached,
    user: {
      ...cached.user,
      ...(hasName ? { name: rawName.trim() } : {}),
      ...(hasAvatar ? { avatar: avatarForBootstrap } : {}),
    },
  };
}

export default function PublicProfileScreen() {
  const { userId, userName, userAvatar } = useLocalSearchParams<{
    userId: string;
    userName?: string;
    userAvatar?: string;
  }>();
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const ablyChatMounted = useAblyChatMounted();
  const [loading, setLoading] = useState(
    () => !computeBootstrapProfile(userId, userName, userAvatar),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(
    () => computeBootstrapProfile(userId, userName, userAvatar),
  );
  const [rounds, setRounds] = useState<ProfileRound[]>([]);
  const [roundsLoading, setRoundsLoading] = useState(false);
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [commentSheetPost, setCommentSheetPost] = useState<ProfilePost | null>(null);
  const [comments, setComments] = useState<ProfileComment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const [overflowPost, setOverflowPost] = useState<ProfilePost | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [dmBusy, setDmBusy] = useState(false);

  const [prevUserId, setPrevUserId] = useState(userId);
  if (userId !== prevUserId) {
    setPrevUserId(userId);
    const next = computeBootstrapProfile(userId, userName, userAvatar);
    setProfile(next);
    setLoading(!next);
    setRounds([]);
    setPosts([]);
    setError(null);
  }

  const avatarSize = Math.round(Math.min(windowWidth - 48, 340) * 0.75);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const loadProfile = useCallback(async (options?: { silent?: boolean }) => {
    if (!userId) return;
    const silent = options?.silent ?? false;
    setRoundsLoading(true);
    setPostsLoading(true);
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const token = await getTokenRef.current();
      const json = await fetchPublicProfileAndCache(userId, token);
      setProfile(json);
      const [roundsData, postsData] = await Promise.all([
        apiGet<ProfileRoundsResponse>(`/api/users/${encodeURIComponent(userId)}/open-rounds`, token)
          .catch(() => ({ hosting: [], joined: [] })),
        apiGet<{ posts: ProfilePost[] }>(
          `/api/posts?userId=${encodeURIComponent(userId)}&limit=20`,
          token,
        ).catch(() => ({ posts: [] })),
      ]);

      const fallbackRounds = roundsData.rounds ?? [];
      const hosting = (roundsData.hosting ?? fallbackRounds).map((round) => ({
        ...round,
        source: "hosting" as const,
      }));
      const joined = (roundsData.joined ?? []).map((round) => ({
        ...round,
        source: "joined" as const,
      }));
      setRounds([...hosting, ...joined]);
      setPosts(postsData.posts ?? []);
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : "Unable to load profile.");
      setRounds([]);
      setPosts([]);
    } finally {
      if (!silent) {
        setLoading(false);
        setRoundsLoading(false);
        setPostsLoading(false);
      } else {
        setRoundsLoading(false);
        setPostsLoading(false);
      }
    }
  }, [userId]);

  const onRemoteProfileUpdate = useCallback(() => {
    void loadProfile({ silent: true });
  }, [loadProfile]);

  useEffect(() => {
    if (!userId) return;
    const hasBootstrap = Boolean(computeBootstrapProfile(userId, userName, userAvatar));
    void loadProfile({ silent: hasBootstrap });
  }, [userId, userName, userAvatar, loadProfile]);

  const openOrCreateDm = useCallback(async () => {
    if (!userId || dmBusy) return;
    setDmBusy(true);
    try {
      const authToken = await getTokenRef.current();
      const data = await apiPost<{ conversationId: string; existing: boolean }>(
        "/api/conversations",
        { participantUserId: userId },
        authToken,
      );
      const dmPic = profile?.user.avatar ?? null;
      router.push({
        pathname: "/conversation/[id]/chat",
        params: {
          id: data.conversationId,
          chatTitle: profile?.user.name ?? "Chat",
          chatAvatars: JSON.stringify(dmPic ? [dmPic] : []),
          chatType: "dm",
        },
      });
    } catch {
      Alert.alert("Error", "Unable to open conversation.");
    } finally {
      setDmBusy(false);
    }
  }, [userId, dmBusy, router, profile?.user.avatar, profile?.user.name]);

  const isMutual = profile?.user.relationship === "mutual";
  const isSelfProfile = profile?.user.relationship === "self";

  useLayoutEffect(() => {
    const title = loading ? "Profile" : formatProfileNavTitle(profile?.user.name ?? "");
    const isSelf = profile?.user.relationship === "self";
    navigation.setOptions({
      title,
      headerRight: isSelf
        ? undefined
        : () => (
            <Pressable
              onPress={() => setOverflowOpen(true)}
              hitSlop={8}
              style={{ paddingHorizontal: 8 }}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
            </Pressable>
          ),
    });
  }, [navigation, loading, profile?.user.relationship, profile?.user.name]);

  const handicapDisplay = profile?.user.handicap?.trim() || "";
  const locationDisplay = profile?.user.location?.trim() || "";
  const displayAvatar =
    profile != null && profile.user.avatar != null ? profile.user.avatar : null;
  const feedLoading = roundsLoading || postsLoading;
  const feedItems = useMemo<ProfileFeedItem[]>(() => {
    const roundItems: ProfileFeedItem[] = rounds.map((round) => ({
      kind: "round",
      id: `round-${round.id}`,
      ts: new Date(round.createdAt).getTime(),
      round,
    }));
    const postItems: ProfileFeedItem[] = posts.map((post) => ({
      kind: "post",
      id: `post-${post.id}`,
      ts: new Date(post.createdAt).getTime(),
      post,
    }));
    return [...roundItems, ...postItems].sort((a, b) => {
      const aPinned = a.kind === "post" && Boolean(a.post.isPinned);
      const bPinned = b.kind === "post" && Boolean(b.post.isPinned);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
      return b.ts - a.ts;
    });
  }, [rounds, posts]);

  async function handleFollowAction() {
    if (!profile || profile.user.relationship === "self" || !userId || busy) return;
    setBusy(true);
    setError(null);
    const prevProfile = profile;

    const relation = profile.user.relationship;
    const shouldDelete =
      relation === "following" || relation === "mutual" || relation === "requested_by_viewer";

    setProfile((current) => {
      if (!current) return current;
      const visibility = current.user.followVisibility;
      let nextRelationship = current.user.relationship;
      let nextFollowersCount = current.user.followersCount;

      if (shouldDelete) {
        if (current.user.relationship === "following") nextRelationship = "none";
        else if (current.user.relationship === "mutual") nextRelationship = "followed_by";
        else if (current.user.relationship === "requested_by_viewer") nextRelationship = "none";
        if (current.user.relationship === "following" || current.user.relationship === "mutual") {
          nextFollowersCount = Math.max(0, nextFollowersCount - 1);
        }
      } else if (visibility === "private") {
        nextRelationship = "requested_by_viewer";
      } else if (current.user.relationship === "followed_by") {
        nextRelationship = "mutual";
        nextFollowersCount += 1;
      } else {
        nextRelationship = "following";
        nextFollowersCount += 1;
      }

      const nextProfile = {
        ...current,
        user: {
          ...current.user,
          relationship: nextRelationship,
          followersCount: nextFollowersCount,
        },
      };
      setCachedPublicProfile(nextProfile);
      return nextProfile;
    });

    try {
      const token = await getTokenRef.current();
      if (shouldDelete) {
        await apiDelete(`/api/users/${userId}/follow`, token);
      } else {
        await apiPost(`/api/users/${userId}/follow`, {}, token);
      }
    } catch (followError) {
      setProfile(prevProfile);
      if (prevProfile) setCachedPublicProfile(prevProfile);
      setError(followError instanceof Error ? followError.message : "Unable to update follow.");
    } finally {
      setBusy(false);
    }
  }

  async function handleShareProfile() {
    if (!profile || !userId) return;
    const uid = Array.isArray(userId) ? userId[0] : userId;
    if (!uid) return;
    const profileUrl = `${publicWebOrigin}/profile/${uid}`;
    try {
      await Share.share({
        message: `Check out ${profile.user.name}'s profile on Parfade: ${profileUrl}`,
      });
    } catch {
      /* user cancelled or share unavailable */
    }
  }

  async function handleToggleLike(post: ProfilePost) {
    const wasLiked = Boolean(post.viewerLiked);
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? {
              ...p,
              viewerLiked: !wasLiked,
              likeCount: Math.max(0, (p.likeCount ?? 0) + (wasLiked ? -1 : 1)),
            }
          : p,
      ),
    );
    try {
      const token = await getTokenRef.current();
      await apiPost(`/api/posts/${post.id}/like`, {}, token);
    } catch {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? {
                ...p,
                viewerLiked: wasLiked,
                likeCount: Math.max(0, (p.likeCount ?? 0) + (wasLiked ? 1 : -1)),
              }
            : p,
        ),
      );
    }
  }

  async function openCommentSheet(post: ProfilePost) {
    setCommentSheetPost(post);
    setComments([]);
    setCommentDraft("");
    setLoadingComments(true);
    try {
      const token = await getTokenRef.current();
      const data = await apiGet<{ comments: ProfileComment[] }>(
        `/api/posts/${post.id}/comments`,
        token,
      );
      setComments(data.comments ?? []);
    } catch {
      setComments([]);
    } finally {
      setLoadingComments(false);
    }
  }

  async function handlePostComment() {
    if (!commentSheetPost) return;
    const body = commentDraft.trim();
    if (!body) return;
    setPostingComment(true);
    try {
      const token = await getTokenRef.current();
      const data = await apiPost<{ comment: ProfileComment }>(
        `/api/posts/${commentSheetPost.id}/comments`,
        { body },
        token,
      );
      setComments((prev) => [...prev, data.comment]);
      setCommentDraft("");
      setPosts((prev) =>
        prev.map((p) =>
          p.id === commentSheetPost.id ? { ...p, commentCount: (p.commentCount ?? 0) + 1 } : p,
        ),
      );
    } finally {
      setPostingComment(false);
    }
  }

  function openEditPost(post: ProfilePost) {
    setOverflowPost(null);
    router.push({
      pathname: "/profile/post",
      params: {
        editId: post.id,
        editBody: post.body,
        ...(post.imageUrl ? { editImageUrl: post.imageUrl } : {}),
      },
    });
  }

  function handleDeletePost(post: ProfilePost) {
    setOverflowPost(null);
    Alert.alert("Delete post", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const token = await getTokenRef.current();
            await apiDelete(`/api/posts/${post.id}`, token);
            setPosts((prev) => prev.filter((p) => p.id !== post.id));
          } catch (e) {
            Alert.alert("Error", e instanceof Error ? e.message : "Could not delete.");
          }
        },
      },
    ]);
  }

  async function handleTogglePin(post: ProfilePost) {
    const nextPinned = !post.isPinned;
    setOverflowPost(null);
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, isPinned: nextPinned } : p)));
    try {
      const token = await getTokenRef.current();
      await apiPatch(`/api/posts/${post.id}`, { isPinned: nextPinned }, token);
    } catch {
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, isPinned: post.isPinned } : p)));
    }
  }

  function followButtonText() {
    const relationship = profile?.user.relationship;
    if (!relationship || relationship === "self") return "";
    if (relationship === "requested_by_viewer") return "Requested";
    if (relationship === "following" || relationship === "mutual") return "Unfollow";
    if (relationship === "requested_to_viewer") return "Requested you";
    return "Follow";
  }

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={colors.fairway} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.errorText}>{error ?? "Profile unavailable."}</Text>
      </View>
    );
  }

  return (
    <>
      {ablyChatMounted && userId ? (
        <ParfadeProfileLiveRefresh profileUserId={userId} onProfileMaybeUpdated={onRemoteProfileUpdate} />
      ) : null}
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadProfile({ silent: true }).finally(() => setRefreshing(false));
            }}
            tintColor={colors.fairway}
          />
        }
      >
      <Pressable
        style={[styles.avatarShadowOuter, { width: avatarSize, height: avatarSize }]}
        onPress={
          displayAvatar
            ? () => {
                setViewerImages([toAbsoluteUrl(displayAvatar)]);
                setViewerVisible(true);
              }
            : undefined
        }
        disabled={!displayAvatar}
      >
        <View style={[styles.avatarClip, { width: avatarSize, height: avatarSize }]}>
          {displayAvatar ? (
            <Image
              source={toAbsoluteUrl(displayAvatar)}
              style={[styles.avatarImage, { width: avatarSize, height: avatarSize }]}
              contentFit="cover"
              transition={0}
              priority="high"
              cachePolicy="memory-disk"
              accessibilityLabel="Profile photo"
            />
          ) : (
            <InitialAvatar
              name={profile?.user.name ?? ""}
              size={avatarSize}
              maxInitials={2}
              borderRadius={AVATAR_RADIUS}
            />
          )}
        </View>
      </Pressable>

      <View style={styles.identityBlock}>
        <Text style={styles.profileName}>{profile.user.name}</Text>
        {locationDisplay ? (
          <Text style={styles.profileLocation} numberOfLines={2}>
            {locationDisplay}
          </Text>
        ) : null}
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statCell}>
          <Text style={styles.statCellValue}>{handicapDisplay || "—"}</Text>
          <Text style={styles.statCellLabel}>Handicap</Text>
        </View>
        <Pressable
          style={styles.statCell}
          onPress={() =>
            router.push({
              pathname: "/profile/[userId]/followers",
              params: { userId },
            })
          }
        >
          <Text style={styles.statCellValue}>{profile.user.followersCount}</Text>
          <Text style={styles.statCellLabel}>Followers</Text>
        </Pressable>
        <Pressable
          style={styles.statCell}
          onPress={() =>
            router.push({
              pathname: "/profile/[userId]/following",
              params: { userId },
            })
          }
        >
          <Text style={styles.statCellValue}>{profile.user.followingCount}</Text>
          <Text style={styles.statCellLabel}>Following</Text>
        </Pressable>
      </View>

      <View style={btn.actions}>
        {profile.user.relationship !== "self" ? (
          <Pressable
            style={({ pressed }) => [
              btn.primaryButton,
              pressed && !busy && btn.pressed,
              busy && styles.disabledButton,
            ]}
            onPress={() => void handleFollowAction()}
            disabled={busy}
          >
            <Text style={btn.primaryText}>{followButtonText()}</Text>
          </Pressable>
        ) : null}
        {isMutual ? (
          <Pressable
            style={({ pressed }) => [
              btn.secondaryButton,
              pressed && !dmBusy && btn.pressed,
              dmBusy && styles.disabledButton,
            ]}
            onPress={() => void openOrCreateDm()}
            disabled={dmBusy}
          >
            <Text style={btn.secondaryText}>Message</Text>
          </Pressable>
        ) : null}
      </View>

      {userId ? (
        <>
          <View style={styles.feedSection}>
            <Text style={styles.feedSectionTitle}>Activity</Text>
          </View>
          {feedLoading ? (
            <View style={styles.postsLoadingWrap}>
              <ActivityIndicator color={colors.fairway} />
            </View>
          ) : feedItems.length === 0 ? (
            <View style={styles.profileEmptyCard}>
              <View style={styles.profileEmptyIconWrap}>
                <Ionicons name="golf-outline" size={26} color={colors.fairway} />
              </View>
              <Text style={styles.profileEmptyTitle}>No rounds or posts yet</Text>
              <Text style={styles.profileEmptyBody}>
                This user has not created a round yet. Invite them to one of yours and get a match going.
              </Text>
            </View>
          ) : (
            <View style={styles.postsSection}>
              {feedItems.map((item) =>
                item.kind === "post" ? (
                  (() => {
                    const post = item.post;
                    return (
                      <View key={item.id} style={styles.postCard}>
                        <View style={styles.postHeader}>
                          {post.user.avatar ? (
                            <Image
                              source={toAbsoluteUrl(post.user.avatar)}
                              style={styles.postAvatar}
                              contentFit="cover"
                              transition={0}
                            />
                          ) : (
                            <InitialAvatar name={post.user.name} size={36} maxInitials={2} />
                          )}
                          <View style={styles.postHeaderText}>
                            <Text style={styles.postAuthor}>{post.user.name}</Text>
                            <Text style={styles.postDate}>
                              {new Date(post.createdAt).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </Text>
                          </View>
                          {post.isPinned ? (
                            <Ionicons name="pin" size={14} color={colors.muted} />
                          ) : null}
                          {isSelfProfile ? (
                            <Pressable
                              style={styles.postOverflow}
                              onPress={() => setOverflowPost(post)}
                              hitSlop={8}
                            >
                              <Ionicons name="ellipsis-horizontal" size={18} color={colors.muted} />
                            </Pressable>
                          ) : null}
                        </View>
                        <Text style={styles.postBody}>{post.body}</Text>
                        {post.imageUrl ? (
                          <Pressable
                            onPress={() => {
                              setViewerImages([toAbsoluteUrl(post.imageUrl ?? "")]);
                              setViewerVisible(true);
                            }}
                          >
                            <Image
                              source={toAbsoluteUrl(post.imageUrl)}
                              style={styles.postImage}
                              contentFit="cover"
                              transition={0}
                            />
                          </Pressable>
                        ) : null}
                        <View style={styles.postFooter}>
                          <Pressable
                            style={styles.postLikeBtn}
                            onPress={() => void handleToggleLike(post)}
                          >
                            <Ionicons
                              name={post.viewerLiked ? "heart" : "heart-outline"}
                              size={18}
                              color={post.viewerLiked ? colors.danger : colors.muted}
                            />
                            {(post.likeCount ?? 0) > 0 ? (
                              <Text
                                style={[
                                  styles.postLikeCount,
                                  post.viewerLiked && styles.postLikeCountActive,
                                ]}
                              >
                                {post.likeCount}
                              </Text>
                            ) : null}
                          </Pressable>
                          <Pressable
                            style={styles.postCommentBtn}
                            onPress={() => void openCommentSheet(post)}
                          >
                            <Ionicons name="chatbubble-outline" size={17} color={colors.muted} />
                            {(post.commentCount ?? 0) > 0 ? (
                              <Text style={styles.postCommentCount}>{post.commentCount}</Text>
                            ) : null}
                          </Pressable>
                        </View>
                      </View>
                    );
                  })()
                ) : (
                  (() => {
                    const round = item.round;
                    const effectiveIso = round.teeTime ?? round.targetDate;
                    return (
                      <View key={item.id} style={styles.cardWrap}>
                        <Text style={styles.feedBadge}>
                          {round.source === "hosting" ? "Hosting" : "Joined"}
                        </Text>
                        <RoundListCard
                          roundId={round.id}
                          mode={
                            round.mode === "planning"
                              ? "planning"
                              : round.mode === "tournament"
                                ? "tournament"
                                : "scheduled"
                          }
                          courseName={round.courseName}
                          tournamentTitle={resolveTournamentTitle(round)}
                          inviteToken={round.inviteToken}
                          imageUrl={round.imageUrl}
                          joinPolicy={round.joinPolicy}
                          totalSpots={round.totalSpots}
                          confirmedPlayers={round.confirmedPlayers}
                          onCardPressIn={() =>
                            prefetchRoundOpen(round.inviteToken, round.imageUrl, () => getTokenRef.current())
                          }
                          onPress={() =>
                            router.push({
                              pathname: "/round/[token]",
                              params: {
                                token: round.inviteToken,
                                roundHint: buildRoundListHint(toMineRoundForHint(round)),
                              },
                            })
                          }
                          primaryMeta={
                            round.mode === "scheduled" || round.mode === "tournament"
                              ? formatScheduledCardMeta(effectiveIso, round.teeTime)
                              : formatPlanningWindow(getTimeWindows(round))
                          }
                          planningLocation={round.planningLocation}
                          planningHeaderDate={formatPlanningHeaderDate(round.targetDate)}
                          preferredTimeWindow={getTimeWindows(round)}
                          onPlayerPress={(player) =>
                            router.push({
                              pathname: "/profile/[userId]",
                              params: {
                                userId: player.id,
                                userName: player.name,
                                userAvatar: player.avatar ?? "",
                              },
                            })
                          }
                        />
                      </View>
                    );
                  })()
                ),
              )}
            </View>
          )}
        </>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </ScrollView>

    <AnimatedBottomSheetFrame
      visible={!!commentSheetPost}
      onClose={() => setCommentSheetPost(null)}
      snapPoints={COMMENT_SNAP_POINTS}
      topInset={insets.top}
      sheetStyle={styles.commentsSheet}
      keyboardBlurBehavior="restore"
      enableContentPanningGesture={false}
      dragHandle
    >
      <Text style={styles.commentsTitle}>Comments</Text>
      <BottomSheetScrollView
        style={styles.commentsScroll}
        contentContainerStyle={styles.commentsScrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {loadingComments ? (
          <View style={styles.commentsLoadingWrap}>
            <ActivityIndicator color={colors.fairway} />
          </View>
        ) : comments.length === 0 ? (
          <Text style={styles.commentsEmpty}>No comments yet.</Text>
        ) : (
          comments.map((c) => (
            <View key={c.id} style={styles.commentRow}>
              {c.user.avatar ? (
                <Image source={toAbsoluteUrl(c.user.avatar)} style={styles.commentAvatar} />
              ) : (
                <InitialAvatar name={c.user.name} size={30} maxInitials={2} />
              )}
              <View style={styles.commentBodyWrap}>
                <Text style={styles.commentAuthor}>{c.user.name}</Text>
                <Text style={styles.commentBody}>{c.body}</Text>
              </View>
            </View>
          ))
        )}
      </BottomSheetScrollView>
      <View style={styles.commentComposerRow}>
        <BottomSheetTextInput
          value={commentDraft}
          onChangeText={setCommentDraft}
          placeholder="Write a comment..."
          placeholderTextColor={colors.muted}
          style={styles.commentInput}
        />
        <Pressable
          style={[
            styles.commentSendBtn,
            (!commentDraft.trim() || postingComment) && styles.commentSendBtnDisabled,
          ]}
          onPress={() => void handlePostComment()}
          disabled={!commentDraft.trim() || postingComment}
        >
          {postingComment ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.commentSendText}>Post</Text>
          )}
        </Pressable>
      </View>
    </AnimatedBottomSheetFrame>

    <OverflowMenuSheet
      visible={!!overflowPost}
      onClose={() => setOverflowPost(null)}
      items={overflowPost ? [
        {
          key: "edit",
          label: "Edit post",
          icon: "create-outline" as const,
          onPress: () => openEditPost(overflowPost),
        },
        {
          key: "pin",
          label: overflowPost.isPinned ? "Unpin post" : "Pin to top",
          icon: (overflowPost.isPinned ? "pin-outline" : "pin") as const,
          onPress: () => void handleTogglePin(overflowPost),
        },
        {
          key: "delete",
          label: "Delete post",
          icon: "trash-outline" as const,
          destructive: true,
          onPress: () => handleDeletePost(overflowPost),
        },
      ] : []}
    />

    <OverflowMenuSheet
      visible={overflowOpen}
      onClose={() => setOverflowOpen(false)}
      items={[
        {
          key: "share",
          label: "Share profile",
          icon: "share-outline" as const,
          onPress: () => void handleShareProfile(),
        },
        {
          key: "report",
          label: `Report ${profile?.user.name?.split(" ")[0] ?? "user"}`,
          icon: "flag-outline" as const,
          destructive: true,
          onPress: () => {
            setTimeout(() => setReportOpen(true), 350);
          },
        },
        {
          key: "block",
          label: `${blocked ? "Unblock" : "Block"} ${profile?.user.name?.split(" ")[0] ?? "user"}`,
          icon: (blocked ? "person-add-outline" : "ban-outline") as const,
          destructive: !blocked,
          onPress: () => {
            const name = profile?.user.name?.split(" ")[0] ?? "this user";
            if (blocked) {
              Alert.alert(`Unblock ${name}?`, "You will be able to see their content again.", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Unblock",
                  onPress: async () => {
                    try {
                      const token = await getTokenRef.current();
                      await apiDelete(`/api/users/${userId}/block`, token);
                      setBlocked(false);
                      hapticSuccess();
                    } catch {
                      Alert.alert("Error", "Unable to unblock.");
                    }
                  },
                },
              ]);
            } else {
              Alert.alert(`Block ${name}?`, "They won't be able to see your profile or interact with you.", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Block",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      const token = await getTokenRef.current();
                      await apiPost(`/api/users/${userId}/block`, {}, token);
                      setBlocked(true);
                      hapticSuccess();
                    } catch {
                      Alert.alert("Error", "Unable to block.");
                    }
                  },
                },
              ]);
            }
          },
        },
      ]}
    />

    {userId ? (
      <ReportSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        contentType="user"
        contentId={userId}
        targetUserId={userId}
        targetLabel={profile?.user.name ?? "this user"}
      />
    ) : null}
    {viewerImages.length > 0 ? (
      <FullscreenImageViewer
        images={viewerImages}
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
      />
    ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingBottom: 32,
    paddingHorizontal: 16,
    paddingTop: 16,
    alignItems: "center",
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  avatarShadowOuter: {
    borderRadius: AVATAR_RADIUS,
    backgroundColor: colors.surface,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 22,
    elevation: 10,
  },
  avatarClip: {
    borderRadius: AVATAR_RADIUS,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  avatarImage: {
    borderRadius: AVATAR_RADIUS,
  },
  avatarPlaceholder: {
    borderRadius: AVATAR_RADIUS,
    backgroundColor: colors.fairwaySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    color: colors.fairway,
    fontWeight: "800",
  },
  identityBlock: {
    alignItems: "center",
    paddingTop: 20,
    paddingHorizontal: 8,
    gap: 6,
    width: "100%",
  },
  profileName: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 26,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  profileLocation: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  statsGrid: {
    flexDirection: "row",
    width: "100%",
    marginTop: 24,
    paddingVertical: 20,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  statCell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 4,
  },
  statCellValue: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 20,
  },
  statCellLabel: {
    color: colors.muted,
    fontWeight: "600",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  errorText: { color: colors.danger, marginTop: 12, textAlign: "center" },
  disabledButton: { opacity: 0.6 },
  feedSection: {
    alignSelf: "stretch",
    width: "100%",
    marginTop: 22,
    marginBottom: 6,
  },
  feedSectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.3,
  },
  postsSection: {
    alignSelf: "stretch",
    width: "100%",
    marginTop: 8,
    marginBottom: 8,
    gap: 10,
  },
  postsLoadingWrap: {
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardWrap: { gap: 8 },
  feedBadge: {
    alignSelf: "flex-start",
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 2,
  },
  profileEmptyCard: {
    alignSelf: "stretch",
    width: "100%",
    marginTop: 20,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: "center",
    gap: 8,
  },
  profileEmptyIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.fairwaySoft,
  },
  profileEmptyTitle: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 18,
    textAlign: "center",
  },
  profileEmptyBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    maxWidth: 320,
  },
  postCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 12,
    gap: 10,
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  postAvatar: {
    width: 36,
    height: 36,
    borderRadius: 999,
  },
  postHeaderText: {
    flex: 1,
    gap: 2,
  },
  postOverflow: {
    padding: 2,
  },
  postAuthor: {
    color: colors.text,
    fontWeight: "700",
  },
  postDate: {
    color: colors.muted,
    fontSize: 12,
  },
  postBody: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  postImage: {
    width: "100%",
    height: 220,
    borderRadius: 10,
    backgroundColor: colors.fairwaySoft,
  },
  postFooter: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    paddingTop: 2,
  },
  postLikeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  postLikeCount: {
    color: colors.muted,
    fontWeight: "600",
    fontSize: 13,
  },
  postLikeCountActive: {
    color: colors.danger,
  },
  postCommentBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  postCommentCount: {
    color: colors.muted,
    fontWeight: "600",
    fontSize: 13,
  },
  commentsSheet: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 10,
  },
  commentsTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  commentsScroll: {
    flex: 1,
  },
  commentsScrollContent: {
    gap: 10,
    paddingBottom: 8,
  },
  commentsLoadingWrap: {
    paddingVertical: 20,
    alignItems: "center",
  },
  commentsEmpty: {
    color: colors.muted,
    textAlign: "center",
    paddingVertical: 14,
  },
  commentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  commentAvatar: {
    width: 30,
    height: 30,
    borderRadius: 999,
  },
  commentBodyWrap: {
    flex: 1,
    backgroundColor: "#f3f1ed",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  commentAuthor: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 12,
  },
  commentBody: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 19,
  },
  commentComposerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  commentInput: {
    flex: 1,
    backgroundColor: "#f1efea",
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    color: colors.text,
  },
  commentSendBtn: {
    backgroundColor: colors.fairway,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 58,
    alignItems: "center",
    justifyContent: "center",
  },
  commentSendBtnDisabled: {
    opacity: 0.5,
  },
  commentSendText: {
    color: "#fff",
    fontWeight: "700",
  },
});
