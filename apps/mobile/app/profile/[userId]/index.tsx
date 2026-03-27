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
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { FullscreenImageViewer } from "../../../components/fullscreen-image-viewer";
import { InitialAvatar } from "../../../components/initial-avatar";
import { OverflowMenuSheet } from "../../../components/overflow-menu-sheet";
import { ParfadeProfileLiveRefresh } from "../../../components/parfade-profile-live-refresh";
import { ProfileStatCategoryCards } from "../../../components/profile-stat-category-cards";
import { ReportSheet } from "../../../components/report-sheet";
import { hapticSuccess } from "../../../lib/haptics";
import { claimRsvpButtonStyles as btn } from "../../../lib/claim-rsvp-button-styles";
import { formatProfileNavTitle } from "../../../lib/format-profile-nav-title";
import { useAblyChatMounted } from "../../../lib/ably-chat-context";
import { apiDelete, apiPost, publicWebOrigin, toAbsoluteUrl } from "../../../lib/api";
import {
  fetchPublicProfileAndCache,
  getCachedPublicProfile,
  PublicProfile,
  setCachedPublicProfile,
} from "../../../lib/public-profile-cache";
import {
  ensureSkinsFourthColumn,
  fetchUserStats,
  type ProfileStatsGrouped,
} from "../../../lib/profile-stats-api";
import { colors } from "../../../lib/theme";
import { parfadeUserAvatarUrlForDisplay } from "../../../lib/user-avatar-display";

const AVATAR_RADIUS = 28;

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
  const displayAvatar = parfadeUserAvatarUrlForDisplay(
    typeof rawAvatar === "string" ? rawAvatar : null,
  );
  const hasAvatar = displayAvatar != null;

  if (!cached) {
    if (!hasName && !hasAvatar) return null;
    return {
      user: {
        id: userId,
        name: hasName ? rawName.trim() : "Profile",
        avatar: displayAvatar,
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
      ...(hasAvatar ? { avatar: displayAvatar } : {}),
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
  const { width: windowWidth } = useWindowDimensions();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const ablyChatMounted = useAblyChatMounted();
  const [loading, setLoading] = useState(
    () => !computeBootstrapProfile(userId, userName, userAvatar),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [avatarViewerVisible, setAvatarViewerVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(
    () => computeBootstrapProfile(userId, userName, userAvatar),
  );
  const [groupedStats, setGroupedStats] = useState<ProfileStatsGrouped | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
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
    setGroupedStats(null);
    setError(null);
  }

  const avatarSize = Math.round(Math.min(windowWidth - 48, 340) * 0.75);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const loadProfile = useCallback(async (options?: { silent?: boolean }) => {
    if (!userId) return;
    const silent = options?.silent ?? false;
    if (!silent) {
      setLoading(true);
      setStatsLoading(true);
    }
    setError(null);
    try {
      const token = await getTokenRef.current();
      const json = await fetchPublicProfileAndCache(userId, token);
      setProfile(json);
      try {
        const { grouped, stats } = await fetchUserStats(token, userId);
        setGroupedStats(ensureSkinsFourthColumn(grouped, stats));
      } catch {
        setGroupedStats(null);
      }
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : "Unable to load profile.");
      setGroupedStats(null);
    } finally {
      if (!silent) {
        setLoading(false);
        setStatsLoading(false);
      } else {
        setStatsLoading(false);
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
      router.push({
        pathname: "/conversation/[id]/chat",
        params: {
          id: data.conversationId,
          chatTitle: profile?.user.name ?? "Chat",
          chatAvatars: JSON.stringify(
            profile?.user.avatar ? [profile.user.avatar] : [],
          ),
          chatType: "dm",
        },
      });
    } catch {
      Alert.alert("Error", "Unable to open conversation.");
    } finally {
      setDmBusy(false);
    }
  }, [userId, dmBusy, router]);

  const isMutual = profile?.user.relationship === "mutual";

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
        onPress={profile.user.avatar ? () => setAvatarViewerVisible(true) : undefined}
        disabled={!profile.user.avatar}
      >
        <View style={[styles.avatarClip, { width: avatarSize, height: avatarSize }]}>
          {profile.user.avatar ? (
            <Image
              source={toAbsoluteUrl(profile.user.avatar)}
              style={[styles.avatarImage, { width: avatarSize, height: avatarSize }]}
              contentFit="cover"
              transition={0}
              priority="high"
              cachePolicy="memory-disk"
              accessibilityLabel="Profile photo"
            />
          ) : (
            <InitialAvatar name={profile?.user.name ?? ""} size={avatarSize} maxInitials={2} />
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
            style={[btn.button, btn.primaryButton, busy && styles.disabledButton]}
            onPress={() => void handleFollowAction()}
            disabled={busy}
          >
            <Text style={btn.primaryText}>{followButtonText()}</Text>
          </Pressable>
        ) : null}
        {isMutual ? (
          <Pressable
            style={[btn.button, btn.secondaryButton, dmBusy && styles.disabledButton]}
            onPress={() => void openOrCreateDm()}
            disabled={dmBusy}
          >
            <Text style={btn.secondaryText}>Message</Text>
          </Pressable>
        ) : null}
      </View>

      {userId ? (
        <ProfileStatCategoryCards
          userId={userId}
          grouped={groupedStats}
          loading={statsLoading}
        />
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </ScrollView>

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
    {profile?.user.avatar ? (
      <FullscreenImageViewer
        images={[toAbsoluteUrl(profile.user.avatar)]}
        visible={avatarViewerVisible}
        onClose={() => setAvatarViewerVisible(false)}
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
});
