import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AnimatedBottomSheetFrame,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "../../components/animated-bottom-sheet-frame";
import { InitialAvatar } from "../../components/initial-avatar";
import { OverflowMenuSheet } from "../../components/overflow-menu-sheet";
import { RoundListCard } from "../../components/round-list-card";
import { claimRsvpButtonStyles as btn } from "../../lib/claim-rsvp-button-styles";
import { apiDelete, apiGet, apiPatch, apiPost, publicWebOrigin, toAbsoluteUrl } from "../../lib/api";
import {
  formatPlanningHeaderDate,
  formatPlanningWindow,
  formatScheduledCardMeta,
  getTimeWindows,
  resolveTournamentTitle,
} from "../../lib/round-card-meta";
import { buildRoundListHint, prefetchRoundOpen } from "../../lib/round-details-cache";
import { getCachedMeProfile, setCachedMeProfile } from "../../lib/me-profile-cache";
import { colors } from "../../lib/theme";
import type { MineRound } from "../../types/round";

type MeResponse = {
  user: {
    id: string;
    name: string;
    email: string | null;
    avatar: string | null;
    handicap: string | null;
    location: string | null;
    homeCourse: string | null;
    followersCount?: number;
    followingCount?: number;
  };
};
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

const AVATAR_RADIUS = 28;
const COMMENT_SNAP_POINTS = ["55%"] as const;

export default function ProfileScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [handicap, setHandicap] = useState("");
  const [location, setLocation] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
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

  const avatarSize = Math.round(Math.min(windowWidth - 48, 340) * 0.75);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    navigation.setOptions({
      headerRightContainerStyle: {
        paddingRight: 12,
      },
      headerRight: () => (
        <View style={styles.headerRightRow}>
          <Pressable
            style={styles.headerSettingsBtn}
            onPress={() => router.push("/search-users")}
            accessibilityLabel="Search users"
          >
            <Ionicons name="search-outline" size={18} color={colors.fairway} />
          </Pressable>
          <Pressable
            style={styles.headerSettingsBtn}
            onPress={() => router.push("/settings")}
            accessibilityLabel="Open settings"
          >
            <Ionicons name="options-outline" size={18} color={colors.fairway} />
          </Pressable>
        </View>
      ),
    });
  }, [navigation, router]);

  function applyMeUser(user: MeResponse["user"]) {
    setCachedMeProfile(user);
    setName(user.name ?? "");
    setHandicap(user.handicap ?? "");
    setLocation(user.location ?? user.homeCourse ?? "");
    setAvatar(user.avatar ?? null);
    setMyUserId(user.id);
    setFollowersCount(user.followersCount ?? 0);
    setFollowingCount(user.followingCount ?? 0);
  }

  async function loadProfile(options?: { silent?: boolean }) {
    const silent = Boolean(options?.silent);
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const token = await getTokenRef.current();
      const json = await apiGet<MeResponse>("/api/users/me", token);
      applyMeUser(json.user);
      await loadProfileFeed(json.user.id);
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : "Unable to load profile.");
    } finally {
      setLoading(false);
    }
  }

  async function loadProfilePosts(targetUserId: string | null | undefined) {
    if (!targetUserId) {
      setPosts([]);
      return;
    }
    setPostsLoading(true);
    try {
      const token = await getTokenRef.current();
      const data = await apiGet<{ posts: ProfilePost[] }>(
        `/api/posts?userId=${encodeURIComponent(targetUserId)}&limit=20`,
        token,
      );
      setPosts(data.posts ?? []);
    } catch {
      setPosts([]);
    } finally {
      setPostsLoading(false);
    }
  }

  async function loadProfileRounds(targetUserId: string | null | undefined) {
    if (!targetUserId) {
      setRounds([]);
      return;
    }
    setRoundsLoading(true);
    try {
      const token = await getTokenRef.current();
      const data = await apiGet<ProfileRoundsResponse>(
        `/api/users/${encodeURIComponent(targetUserId)}/open-rounds`,
        token,
      );
      const fallbackRounds = data.rounds ?? [];
      const hosting = (data.hosting ?? fallbackRounds).map((round) => ({
        ...round,
        source: "hosting" as const,
      }));
      const joined = (data.joined ?? []).map((round) => ({
        ...round,
        source: "joined" as const,
      }));
      setRounds([...hosting, ...joined]);
    } catch {
      setRounds([]);
    } finally {
      setRoundsLoading(false);
    }
  }

  async function loadProfileFeed(targetUserId: string | null | undefined) {
    await Promise.all([loadProfileRounds(targetUserId), loadProfilePosts(targetUserId)]);
  }

  useFocusEffect(
    useCallback(() => {
      const cached = getCachedMeProfile();
      if (cached) {
        setName(cached.name ?? "");
        setHandicap(cached.handicap ?? "");
        setLocation(cached.location ?? cached.homeCourse ?? "");
        setAvatar(cached.avatar ?? null);
        setMyUserId(cached.id);
        setFollowersCount(cached.followersCount ?? 0);
        setFollowingCount(cached.followingCount ?? 0);
        setLoading(false);
      } else {
        setLoading(true);
      }
      void loadProfile({ silent: Boolean(cached) });
    }, []),
  );

  const handicapDisplay = handicap.trim();
  const locationDisplay = location.trim();
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

  async function handleShareProfile() {
    const profileLabel = name.trim() || "Parfade golfer";
    if (!myUserId) {
      await Share.share({
        message: `Check out ${profileLabel} on Parfade.`,
      });
      return;
    }
    const profileUrl = `${publicWebOrigin}/profile/${myUserId}`;
    await Share.share({
      message: `Check out ${profileLabel}'s profile on Parfade: ${profileUrl}`,
    });
  }

  function openProfileComposer() {
    router.push("/profile/post");
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

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.fairway} />
          </View>
        ) : (
          <View style={styles.profileLayout}>
            <View style={[styles.avatarShadowOuter, { width: avatarSize, height: avatarSize }]}>
              <View style={[styles.avatarClip, { width: avatarSize, height: avatarSize }]}>
                {avatar ? (
                  <Image
                    source={{ uri: toAbsoluteUrl(avatar) }}
                    style={[styles.avatarImage, { width: avatarSize, height: avatarSize }]}
                    accessibilityLabel="Profile photo"
                  />
                ) : (
                  <InitialAvatar
                    name={name}
                    size={avatarSize}
                    maxInitials={2}
                    borderRadius={AVATAR_RADIUS}
                  />
                )}
              </View>
            </View>

            <View style={styles.identityBlock}>
              <Text style={styles.profileName}>{name || "Your profile"}</Text>
              {locationDisplay ? (
                <Text style={styles.profileLocation} numberOfLines={2}>
                  {locationDisplay}
                </Text>
              ) : null}
            </View>

            {myUserId ? (
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
                      params: { userId: myUserId },
                    })
                  }
                >
                  <Text style={styles.statCellValue}>{followersCount}</Text>
                  <Text style={styles.statCellLabel}>Followers</Text>
                </Pressable>
                <Pressable
                  style={styles.statCell}
                  onPress={() =>
                    router.push({
                      pathname: "/profile/[userId]/following",
                      params: { userId: myUserId },
                    })
                  }
                >
                  <Text style={styles.statCellValue}>{followingCount}</Text>
                  <Text style={styles.statCellLabel}>Following</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={btn.actions}>
              <Pressable
                style={({ pressed }) => [btn.primaryButton, pressed && btn.pressed]}
                onPress={() => router.push("/profile/edit")}
              >
                <Text style={btn.primaryText}>Edit profile</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [btn.secondaryButton, pressed && btn.pressed]}
                onPress={() => void handleShareProfile()}
              >
                <Text style={btn.secondaryText}>Share profile</Text>
              </Pressable>
            </View>

            {myUserId ? (
              <>
                <Pressable style={styles.composerRow} onPress={openProfileComposer}>
                  {avatar ? (
                    <Image source={{ uri: toAbsoluteUrl(avatar) }} style={styles.composerAvatar} />
                  ) : (
                    <View style={[styles.composerAvatar, styles.composerAvatarFallback]}>
                      <Ionicons name="person" size={16} color={colors.muted} />
                    </View>
                  )}
                  <View style={styles.composerFakeInput}>
                    <Text style={styles.composerPlaceholder}>What's on your mind?</Text>
                  </View>
                </Pressable>

                <View style={styles.activityHeader}>
                  <Text style={styles.activityHeaderTitle}>Activity</Text>
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
                      You have not created a round yet. Start one and invite friends to get this feed going.
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
                                    source={{ uri: toAbsoluteUrl(post.user.avatar) }}
                                    style={styles.postAvatar}
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
                                <Pressable
                                  style={styles.postOverflow}
                                  onPress={() => setOverflowPost(post)}
                                  hitSlop={8}
                                >
                                  <Ionicons name="ellipsis-horizontal" size={18} color={colors.muted} />
                                </Pressable>
                              </View>
                              <Text style={styles.postBody}>{post.body}</Text>
                              {post.imageUrl ? (
                                <Image source={{ uri: toAbsoluteUrl(post.imageUrl) }} style={styles.postImage} />
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
          </View>
        )}
      </ScrollView>
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
                  <Image source={{ uri: toAbsoluteUrl(c.user.avatar) }} style={styles.commentAvatar} />
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
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 40, paddingHorizontal: 16, paddingTop: 12 },
  loadingRow: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
  },
  profileLayout: {
    alignItems: "center",
    gap: 0,
  },
  avatarShadowOuter: {
    alignSelf: "center",
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
    resizeMode: "cover",
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
  headerRightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerSettingsBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  composerRow: {
    alignSelf: "stretch",
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
    marginBottom: 4,
  },
  composerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 999,
  },
  composerAvatarFallback: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  composerFakeInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    height: 38,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  composerPlaceholder: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "500",
  },
  postsSection: {
    alignSelf: "stretch",
    width: "100%",
    marginTop: 0,
    marginBottom: 8,
    gap: 10,
  },
  activityHeader: {
    alignSelf: "stretch",
    width: "100%",
    marginTop: 20,
    marginBottom: 16,
  },
  activityHeaderTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.3,
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
