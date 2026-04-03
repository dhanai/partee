import { useLocalSearchParams, useRouter } from "expo-router";
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
import { FullscreenImageViewer } from "../../components/fullscreen-image-viewer";
import { InitialAvatar } from "../../components/initial-avatar";
import { OverflowMenuSheet } from "../../components/overflow-menu-sheet";
import { ParfadeProfileLiveRefresh } from "../../components/parfade-profile-live-refresh";
import { ProfileGameFeedCard } from "../../components/profile-game-feed-card";
import { RoundListCard } from "../../components/round-list-card";
import { SocialPostCard } from "../../components/social-post-card";
import { useAblyChatMounted } from "../../lib/ably-chat-context";
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
import {
  getCachedMeProfile,
  isMeProfileStale,
  setCachedMeProfile,
  subscribeMeProfile,
  type MeProfile,
} from "../../lib/me-profile-cache";
import type { ProfileGameActivityPayload } from "../../lib/profile-game-feed-types";
import { subscribeProfileActivityEvents } from "../../lib/profile-activity-events";
import { subscribeRoundListsRefresh } from "../../lib/round-lists-refresh";
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
  imageUrls?: string[];
  createdAt: string;
  isPinned?: boolean;
  profileUserId?: string | null;
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
type ProfileActivityResponse = {
  items: Array<
    | { kind: "post"; createdAt: string; post: ProfilePost }
    | { kind: "round"; createdAt: string; round: ProfileRound }
    | { kind: "game"; createdAt: string; game: ProfileGameActivityPayload }
  >;
  nextCursor: string | null;
};
type ProfileFeedItem =
  | { kind: "round"; id: string; ts: number; round: ProfileRound }
  | { kind: "post"; id: string; ts: number; post: ProfilePost }
  | { kind: "game"; id: string; ts: number; game: ProfileGameActivityPayload };
type ProfileComment = {
  id: string;
  body: string;
  createdAt: string;
  parentCommentId?: string | null;
  replyToCommentId?: string | null;
  likeCount?: number;
  viewerLiked?: boolean;
  user: { id: string; name: string; avatar: string | null };
};
type ReplyTarget = {
  commentId: string;
  parentCommentId: string;
  userName: string;
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
let savedSelfProfileScrollY = 0;
const USE_UNIFIED_PROFILE_ACTIVITY = (process.env.EXPO_PUBLIC_PROFILE_ACTIVITY_UNIFIED ?? "1") !== "0";

export default function ProfileScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const {
    postId: rawPostId,
    commentId: rawCommentId,
    replyToCommentId: rawReplyToCommentId,
    highlightGameSessionId: rawHighlightGameSessionId,
  } = useLocalSearchParams<{
    postId?: string;
    commentId?: string;
    replyToCommentId?: string;
    highlightGameSessionId?: string | string[];
  }>();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { getToken } = useAuth();
  const ablyChatMounted = useAblyChatMounted();
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
  const [games, setGames] = useState<ProfileGameActivityPayload[]>([]);
  const [commentSheetPost, setCommentSheetPost] = useState<ProfilePost | null>(null);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [comments, setComments] = useState<ProfileComment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [loadingComments, setLoadingComments] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const [overflowPost, setOverflowPost] = useState<ProfilePost | null>(null);
  const [overflowGame, setOverflowGame] = useState<ProfileGameActivityPayload | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const restoredScrollRef = useRef(false);
  const postYByIdRef = useRef<Map<string, number>>(new Map());
  const gameCardYBySessionIdRef = useRef<Map<string, number>>(new Map());
  const highlightGameScrollDoneRef = useRef(false);
  const prevHighlightGameSessionIdRef = useRef("");
  const handledDeepLinkKeyRef = useRef<string | null>(null);

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

  function applyMeUser(user: MeProfile, options?: { syncCache?: boolean }) {
    if (options?.syncCache !== false) {
      setCachedMeProfile(user);
    }
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
      setPosts((data.posts ?? []).filter((post) => post.profileUserId === targetUserId));
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
    if (!USE_UNIFIED_PROFILE_ACTIVITY) {
      setGames([]);
      await Promise.all([loadProfileRounds(targetUserId), loadProfilePosts(targetUserId)]);
      return;
    }
    if (!targetUserId) {
      setRounds([]);
      setPosts([]);
      setGames([]);
      return;
    }
    setRoundsLoading(true);
    setPostsLoading(true);
    try {
      const token = await getTokenRef.current();
      const data = await apiGet<ProfileActivityResponse>(
        `/api/users/${encodeURIComponent(targetUserId)}/activity?limit=20`,
        token,
      );
      const nextRounds: ProfileRound[] = [];
      const nextPosts: ProfilePost[] = [];
      const nextGames: ProfileGameActivityPayload[] = [];
      for (const item of data.items ?? []) {
        if (item.kind === "round") nextRounds.push(item.round);
        if (item.kind === "post") nextPosts.push(item.post);
        if (item.kind === "game") nextGames.push(item.game);
      }
      setRounds(nextRounds);
      setPosts(nextPosts);
      setGames(nextGames);
    } catch {
      setRounds([]);
      setPosts([]);
      setGames([]);
    } finally {
      setRoundsLoading(false);
      setPostsLoading(false);
    }
  }

  useEffect(() => {
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
    void loadProfile({ silent: Boolean(cached) && !isMeProfileStale() });
  }, []);

  useEffect(() => {
    return subscribeMeProfile((profile) => {
      applyMeUser(profile, { syncCache: false });
    });
  }, []);

  useEffect(() => {
    return subscribeProfileActivityEvents((event) => {
      if (!myUserId) return;
      if (event.profileUserId && event.profileUserId !== myUserId) return;
      if (event.post) {
        if (event.post.profileUserId !== myUserId) return;
        setPosts((prev) => {
          const without = prev.filter((p) => p.id !== event.post!.id);
          return [event.post as ProfilePost, ...without];
        });
        return;
      }
      void (async () => {
        try {
          const token = await getTokenRef.current();
          const data = await apiGet<{ posts: ProfilePost[] }>(
            `/api/posts?userId=${encodeURIComponent(myUserId)}&limit=20`,
            token,
          );
          setPosts((data.posts ?? []).filter((post) => post.profileUserId === myUserId));
        } catch {
          // best effort
        }
      })();
    });
  }, [myUserId]);

  useEffect(() => {
    return subscribeRoundListsRefresh(() => {
      if (!myUserId) return;
      void loadProfileFeed(myUserId);
    });
  }, [myUserId]);

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
    const gameItems: ProfileFeedItem[] = games.map((game) => ({
      kind: "game",
      id: `game-${game.sessionId}`,
      ts: new Date(game.endedAt).getTime(),
      game,
    }));
    return [...roundItems, ...postItems, ...gameItems].sort((a, b) => {
      const aPinned =
        (a.kind === "post" && Boolean(a.post.isPinned)) ||
        (a.kind === "game" && Boolean(a.game.isPinned));
      const bPinned =
        (b.kind === "post" && Boolean(b.post.isPinned)) ||
        (b.kind === "game" && Boolean(b.game.isPinned));
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
      return b.ts - a.ts;
    });
  }, [rounds, posts, games]);

  const highlightGameSessionId = useMemo(() => {
    const raw = rawHighlightGameSessionId;
    if (raw == null) return "";
    const s = Array.isArray(raw) ? raw[0] : raw;
    return typeof s === "string" ? s.trim() : "";
  }, [rawHighlightGameSessionId]);

  useEffect(() => {
    if (prevHighlightGameSessionIdRef.current !== highlightGameSessionId) {
      highlightGameScrollDoneRef.current = false;
      prevHighlightGameSessionIdRef.current = highlightGameSessionId;
    }
  }, [highlightGameSessionId]);

  useEffect(() => {
    if (!highlightGameSessionId || feedLoading) return;
    let cancelled = false;
    const tryScroll = () => {
      if (cancelled || highlightGameScrollDoneRef.current) return;
      const y = gameCardYBySessionIdRef.current.get(highlightGameSessionId);
      if (y == null) return;
      highlightGameScrollDoneRef.current = true;
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
      });
    };
    tryScroll();
    const t = setTimeout(tryScroll, 400);
    const t2 = setTimeout(tryScroll, 900);
    return () => {
      cancelled = true;
      clearTimeout(t);
      clearTimeout(t2);
    };
  }, [highlightGameSessionId, feedLoading, feedItems]);

  const deepLinkPostId = typeof rawPostId === "string" ? rawPostId.trim() : "";
  const deepLinkCommentId = typeof rawCommentId === "string" ? rawCommentId.trim() : "";
  const deepLinkReplyToCommentId =
    typeof rawReplyToCommentId === "string" ? rawReplyToCommentId.trim() : "";
  const deepLinkKey =
    deepLinkPostId.length > 0
      ? `${deepLinkPostId}:${deepLinkCommentId}:${deepLinkReplyToCommentId}`
      : "";
  const commentsById = useMemo(() => {
    const map = new Map<string, ProfileComment>();
    for (const comment of comments) map.set(comment.id, comment);
    return map;
  }, [comments]);
  const topLevelComments = useMemo(
    () => comments.filter((comment) => !comment.parentCommentId),
    [comments],
  );
  const repliesByParent = useMemo(() => {
    const grouped = new Map<string, ProfileComment[]>();
    for (const comment of comments) {
      if (!comment.parentCommentId) continue;
      const list = grouped.get(comment.parentCommentId) ?? [];
      list.push(comment);
      grouped.set(comment.parentCommentId, list);
    }
    return grouped;
  }, [comments]);

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
    const editImages = resolvePostImages(post);
    router.push({
      pathname: "/profile/post",
      params: {
        editId: post.id,
        editBody: post.body,
        ...(post.profileUserId ? { profileUserId: post.profileUserId } : {}),
        ...(editImages.length > 0 ? { editImageUrls: JSON.stringify(editImages) } : {}),
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

  async function handleHideFromProfile(post: ProfilePost) {
    setOverflowPost(null);
    setPosts((prev) => prev.filter((p) => p.id !== post.id));
    try {
      const token = await getTokenRef.current();
      await apiPatch(`/api/posts/${post.id}`, { hideFromProfile: true }, token);
    } catch {
      void loadProfilePosts(myUserId);
    }
  }

  async function handleTogglePinGame(game: ProfileGameActivityPayload) {
    const nextPinned = !Boolean(game.isPinned);
    setOverflowGame(null);
    setGames((prev) =>
      prev.map((g) => (g.sessionId === game.sessionId ? { ...g, isPinned: nextPinned } : g)),
    );
    try {
      const token = await getTokenRef.current();
      await apiPatch(
        `/api/users/me/profile-game-sessions/${encodeURIComponent(game.sessionId)}`,
        { isPinned: nextPinned },
        token,
      );
    } catch {
      setGames((prev) =>
        prev.map((g) =>
          g.sessionId === game.sessionId ? { ...g, isPinned: game.isPinned } : g,
        ),
      );
    }
  }

  async function handleHideGameFromProfile(game: ProfileGameActivityPayload) {
    setOverflowGame(null);
    setGames((prev) => prev.filter((g) => g.sessionId !== game.sessionId));
    try {
      const token = await getTokenRef.current();
      await apiPatch(
        `/api/users/me/profile-game-sessions/${encodeURIComponent(game.sessionId)}`,
        { hideFromProfile: true },
        token,
      );
    } catch {
      void loadProfileFeed(myUserId);
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

  function handleDoubleTapLike(post: ProfilePost) {
    if (post.viewerLiked) return;
    void handleToggleLike(post);
  }

  async function openCommentSheet(post: ProfilePost) {
    setCommentSheetPost(post);
    setComments([]);
    setCommentDraft("");
    setReplyTarget(null);
    setLoadingComments(true);
    try {
      const token = await getTokenRef.current();
      const data = await apiGet<{ comments: ProfileComment[] }>(
        `/api/posts/${post.id}/comments`,
        token,
      );
      const nextComments = data.comments ?? [];
      setComments(nextComments);
      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, commentCount: nextComments.length } : p)),
      );
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
        {
          body,
          parentCommentId: replyTarget?.parentCommentId ?? null,
          replyToCommentId: replyTarget?.commentId ?? null,
        },
        token,
      );
      let nextCount = 0;
      setComments((prev) => {
        const next = [...prev, data.comment];
        nextCount = next.length;
        return next;
      });
      setCommentDraft("");
      setReplyTarget(null);
      setPosts((prev) =>
        prev.map((p) => (p.id === commentSheetPost.id ? { ...p, commentCount: nextCount } : p)),
      );
    } finally {
      setPostingComment(false);
    }
  }

  function closeCommentSheet() {
    if (commentSheetPost) {
      setPosts((prev) =>
        prev.map((p) => (p.id === commentSheetPost.id ? { ...p, commentCount: comments.length } : p)),
      );
    }
    setReplyTarget(null);
    setCommentSheetPost(null);
  }

  useEffect(() => {
    if (!deepLinkKey || !deepLinkPostId) return;
    if (handledDeepLinkKeyRef.current === deepLinkKey) return;
    if (loading || feedLoading) return;
    const post = posts.find((p) => p.id === deepLinkPostId);
    if (!post) return;
    const y = postYByIdRef.current.get(post.id);
    if (typeof y !== "number") return;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
    if (deepLinkCommentId || deepLinkReplyToCommentId) {
      setTimeout(() => {
        void openCommentSheet(post);
      }, 260);
    }
    handledDeepLinkKeyRef.current = deepLinkKey;
  }, [
    deepLinkCommentId,
    deepLinkKey,
    deepLinkPostId,
    deepLinkReplyToCommentId,
    feedLoading,
    loading,
    posts,
  ]);

  function beginReplyToComment(comment: ProfileComment) {
    const parentCommentId = comment.parentCommentId ?? comment.id;
    setReplyTarget({
      commentId: comment.id,
      parentCommentId,
      userName: comment.user.name,
    });
  }

  async function handleToggleCommentLike(comment: ProfileComment) {
    if (!commentSheetPost) return;
    const wasLiked = Boolean(comment.viewerLiked);
    setComments((prev) =>
      prev.map((c) =>
        c.id === comment.id
          ? {
              ...c,
              viewerLiked: !wasLiked,
              likeCount: Math.max(0, (c.likeCount ?? 0) + (wasLiked ? -1 : 1)),
            }
          : c,
      ),
    );
    try {
      const token = await getTokenRef.current();
      await apiPost(`/api/posts/${commentSheetPost.id}/comments/${comment.id}/like`, {}, token);
    } catch {
      setComments((prev) =>
        prev.map((c) =>
          c.id === comment.id
            ? {
                ...c,
                viewerLiked: wasLiked,
                likeCount: Math.max(0, (c.likeCount ?? 0) + (wasLiked ? 1 : -1)),
              }
            : c,
        ),
      );
    }
  }

  return (
    <>
      {ablyChatMounted && myUserId ? (
        <ParfadeProfileLiveRefresh
          profileUserId={myUserId}
          onProfileMaybeUpdated={() => {
            void loadProfile({ silent: true });
          }}
        />
      ) : null}
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={styles.content}
        scrollEventThrottle={16}
        onScroll={(event) => {
          savedSelfProfileScrollY = event.nativeEvent.contentOffset.y;
        }}
        onContentSizeChange={() => {
          if (restoredScrollRef.current) return;
          if (savedSelfProfileScrollY <= 0) {
            restoredScrollRef.current = true;
            return;
          }
          requestAnimationFrame(() => {
            scrollRef.current?.scrollTo({ y: savedSelfProfileScrollY, animated: false });
            restoredScrollRef.current = true;
          });
        }}
      >
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
                    <Text style={styles.profileEmptyTitle}>No activity yet</Text>
                    <Text style={styles.profileEmptyBody}>
                      Rounds, games, and posts you share will show up here. Start a round or finish a side game with
                      friends to fill your feed.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.postsSection}>
                    {feedItems.map((item) =>
                      item.kind === "post" ? (
                        (() => {
                          const post = item.post;
                          const postImages = resolvePostImages(post);
                          return (
                            <View
                              key={item.id}
                              onLayout={(event) => {
                                postYByIdRef.current.set(post.id, event.nativeEvent.layout.y);
                              }}
                            >
                              <SocialPostCard
                                user={post.user}
                                body={post.body}
                                images={postImages}
                                createdAtLabel={new Date(post.createdAt).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                                isPinned={post.isPinned}
                                likeCount={post.likeCount}
                                commentCount={post.commentCount}
                                viewerLiked={post.viewerLiked}
                                showOverflow
                                onPressOverflow={() => setOverflowPost(post)}
                                onPressImage={(index) => {
                                  setViewerImages(postImages);
                                  setViewerIndex(index);
                                  setViewerVisible(true);
                                }}
                                onToggleLike={() => void handleToggleLike(post)}
                                onOpenComments={() => void openCommentSheet(post)}
                                onDoubleTapLike={() => handleDoubleTapLike(post)}
                              />
                            </View>
                          );
                        })()
                      ) : item.kind === "game" ? (
                        myUserId ? (
                          <View
                            key={item.id}
                            onLayout={(event) => {
                              gameCardYBySessionIdRef.current.set(
                                item.game.sessionId,
                                event.nativeEvent.layout.y,
                              );
                            }}
                          >
                            <ProfileGameFeedCard
                              profileUserId={myUserId}
                              game={item.game}
                              showOverflow
                              onPressOverflow={() => setOverflowGame(item.game)}
                            />
                          </View>
                        ) : null
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
        items={
          overflowPost
            ? [
                ...(myUserId && overflowPost.user.id === myUserId
                  ? [
                      {
                        key: "edit",
                        label: "Edit post",
                        icon: "create-outline" as const,
                        onPress: () => openEditPost(overflowPost),
                      },
                      {
                        key: "delete",
                        label: "Delete post",
                        icon: "trash-outline" as const,
                        destructive: true,
                        onPress: () => handleDeletePost(overflowPost),
                      },
                    ]
                  : []),
                ...(overflowPost.isPinned
                  ? [
                      {
                        key: "pin",
                        label: "Unpin post",
                        icon: "pin-outline" as const,
                        onPress: () => void handleTogglePin(overflowPost),
                      },
                    ]
                  : [
                      {
                        key: "pin",
                        label: "Pin to top",
                        icon: "pin" as const,
                        onPress: () => void handleTogglePin(overflowPost),
                      },
                    ]),
                ...(myUserId && overflowPost.user.id !== myUserId
                  ? [
                      {
                        key: "hide",
                        label: "Hide from my profile",
                        icon: "eye-off-outline" as const,
                        onPress: () => void handleHideFromProfile(overflowPost),
                      },
                    ]
                  : []),
              ]
            : []
        }
      />
      <OverflowMenuSheet
        visible={!!overflowGame}
        onClose={() => setOverflowGame(null)}
        items={
          overflowGame
            ? [
                ...(overflowGame.isPinned
                  ? [
                      {
                        key: "pin",
                        label: "Unpin from top",
                        icon: "pin-outline" as const,
                        onPress: () => void handleTogglePinGame(overflowGame),
                      },
                    ]
                  : [
                      {
                        key: "pin",
                        label: "Pin to top",
                        icon: "pin" as const,
                        onPress: () => void handleTogglePinGame(overflowGame),
                      },
                    ]),
                {
                  key: "hide",
                  label: "Hide from my profile",
                  icon: "eye-off-outline" as const,
                  onPress: () => void handleHideGameFromProfile(overflowGame),
                },
              ]
            : []
        }
      />
      <AnimatedBottomSheetFrame
        visible={!!commentSheetPost}
        onClose={closeCommentSheet}
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
          ) : topLevelComments.length === 0 ? (
            <Text style={styles.commentsEmpty}>No comments yet.</Text>
          ) : (
            topLevelComments.map((c) => {
              const replies = repliesByParent.get(c.id) ?? [];
              return (
                <View key={c.id} style={styles.commentThread}>
                  <View style={styles.commentRow}>
                    {c.user.avatar ? (
                      <Image source={{ uri: toAbsoluteUrl(c.user.avatar) }} style={styles.commentAvatar} />
                    ) : (
                      <InitialAvatar name={c.user.name} size={30} maxInitials={2} />
                    )}
                    <View style={styles.commentBodyWrap}>
                      <Text style={styles.commentAuthor}>{c.user.name}</Text>
                      <Text style={styles.commentBody}>{c.body}</Text>
                    </View>
                    <Pressable
                      style={styles.commentLikeIconBtn}
                      hitSlop={8}
                      onPress={() => void handleToggleCommentLike(c)}
                    >
                      <Ionicons
                        name={c.viewerLiked ? "heart" : "heart-outline"}
                        size={16}
                        color={c.viewerLiked ? colors.danger : colors.muted}
                      />
                      {(c.likeCount ?? 0) > 0 ? (
                        <Text style={styles.commentLikeCount}>{c.likeCount}</Text>
                      ) : null}
                    </Pressable>
                  </View>
                  <View style={styles.commentMetaRow}>
                    <Text style={styles.commentMetaText}>{formatCommentAge(c.createdAt)}</Text>
                    <Pressable onPress={() => beginReplyToComment(c)}>
                      <Text style={styles.commentMetaText}>Reply</Text>
                    </Pressable>
                  </View>
                  {replies.length > 0 ? (
                    <View style={styles.replyList}>
                      {replies.map((reply) => {
                        const replyTargetName = reply.replyToCommentId
                          ? commentsById.get(reply.replyToCommentId)?.user.name
                          : null;
                        return (
                          <View key={reply.id} style={styles.commentRow}>
                            {reply.user.avatar ? (
                              <Image
                                source={{ uri: toAbsoluteUrl(reply.user.avatar) }}
                                style={styles.commentAvatarSmall}
                              />
                            ) : (
                              <InitialAvatar name={reply.user.name} size={24} maxInitials={2} />
                            )}
                            <View style={styles.replyBodyWrap}>
                              <Text style={styles.commentAuthor}>{reply.user.name}</Text>
                              <Text style={styles.commentBody}>
                                {replyTargetName ? `@${replyTargetName} ` : ""}
                                {reply.body}
                              </Text>
                            </View>
                            <Pressable
                              style={styles.commentLikeIconBtn}
                              hitSlop={8}
                              onPress={() => void handleToggleCommentLike(reply)}
                            >
                              <Ionicons
                                name={reply.viewerLiked ? "heart" : "heart-outline"}
                                size={14}
                                color={reply.viewerLiked ? colors.danger : colors.muted}
                              />
                              {(reply.likeCount ?? 0) > 0 ? (
                                <Text style={styles.commentLikeCount}>{reply.likeCount}</Text>
                              ) : null}
                            </Pressable>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </BottomSheetScrollView>
        {replyTarget ? (
          <View style={styles.replyingBanner}>
            <Text style={styles.replyingText}>Replying to @{replyTarget.userName}</Text>
            <Pressable onPress={() => setReplyTarget(null)}>
              <Text style={styles.replyingCancel}>Cancel</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.commentComposerRow}>
          <BottomSheetTextInput
            value={commentDraft}
            onChangeText={setCommentDraft}
            placeholder={replyTarget ? `Reply to @${replyTarget.userName}...` : "Write a comment..."}
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
      {viewerImages.length > 0 ? (
        <FullscreenImageViewer
          images={viewerImages}
          initialIndex={viewerIndex}
          visible={viewerVisible}
          onClose={() => setViewerVisible(false)}
        />
      ) : null}
    </>
  );
}

function formatCommentAge(iso: string): string {
  const ageMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.floor(ageMs / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

function resolvePostImages(post: ProfilePost): string[] {
  const list = (post.imageUrls ?? []).map((image) => image.trim()).filter((image) => image.length > 0);
  if (list.length > 0) return list;
  if (post.imageUrl && post.imageUrl.trim().length > 0) return [post.imageUrl.trim()];
  return [];
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
  commentThread: {
    gap: 6,
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
  commentMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginLeft: 40,
  },
  commentMetaText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  commentLikeIconBtn: {
    minWidth: 22,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingTop: 2,
  },
  commentLikeCount: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
  },
  replyList: {
    marginLeft: 22,
    gap: 8,
  },
  commentAvatarSmall: {
    width: 24,
    height: 24,
    borderRadius: 999,
  },
  replyBodyWrap: {
    flex: 1,
    backgroundColor: "#f8f6f3",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 2,
  },
  replyingBanner: {
    marginTop: 4,
    marginBottom: 4,
    paddingHorizontal: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  replyingText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  replyingCancel: {
    color: colors.fairway,
    fontSize: 12,
    fontWeight: "700",
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
