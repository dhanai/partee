import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { useIsFocused } from "@react-navigation/native";
import { setStatusBarStyle } from "expo-status-bar";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  ImageBackground,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { apiDelete, apiPost, toAbsoluteUrl } from "../../../lib/api";
import {
  fetchPublicProfileAndCache,
  getCachedPublicProfile,
  PublicProfile,
  setCachedPublicProfile,
} from "../../../lib/public-profile-cache";
import { colors } from "../../../lib/theme";

const WINDOW_HEIGHT = Dimensions.get("window").height;

function profileHeroHeight() {
  return Math.min(520, Math.max(320, Math.round(WINDOW_HEIGHT * 0.58)));
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

  if (!cached) {
    if (!hasName && !hasAvatar) return null;
    return {
      user: {
        id: userId,
        name: hasName ? rawName.trim() : "Profile",
        avatar: hasAvatar ? rawAvatar.trim() : null,
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
      ...(hasAvatar ? { avatar: rawAvatar.trim() } : {}),
    },
  };
}

export default function PublicProfileScreen() {
  const { userId, userName, userAvatar } = useLocalSearchParams<{
    userId: string;
    userName?: string;
    userAvatar?: string;
  }>();
  const isFocused = useIsFocused();
  const router = useRouter();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(null);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    if (!isFocused) {
      setStatusBarStyle("dark");
      return;
    }
    const immersive = !loading && profile;
    setStatusBarStyle(immersive ? "light" : "dark");
  }, [isFocused, loading, profile]);

  async function loadProfile(options?: { silent?: boolean }) {
    if (!userId) return;
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const token = await getTokenRef.current();
      const json = await fetchPublicProfileAndCache(userId, token);
      setProfile(json);
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : "Unable to load profile.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useLayoutEffect(() => {
    if (!userId) {
      setProfile(null);
      setLoading(true);
      return;
    }
    const next = computeBootstrapProfile(userId, userName, userAvatar);
    setProfile(next);
    setLoading(!next);
    void loadProfile({ silent: Boolean(next) });
  }, [userId, userName, userAvatar]);

  const initials = useMemo(() => {
    const name = profile?.user.name ?? "";
    if (!name.trim()) return "P";
    return name
      .trim()
      .split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }, [profile?.user.name]);
  const handicapDisplay = profile?.user.handicap?.trim() || "";
  const locationDisplay = profile?.user.location?.trim() || "";
  const heroH = profileHeroHeight();

  async function handleFollowAction() {
    if (!profile || profile.user.relationship === "self" || !userId || busy) return;
    setBusy(true);
    setError(null);
    const prevProfile = profile;

    const relation = profile.user.relationship;
    const shouldDelete =
      relation === "following" || relation === "mutual" || relation === "requested_by_viewer";

    // Optimistic UI update for immediate social-app feedback.
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
    if (!profile) return;
    await Share.share({
      message: `Check out ${profile.user.name}'s profile on Parfade.`,
    });
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
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior={Platform.OS === "ios" ? "never" : undefined}
    >
      <View style={[styles.hero, { height: heroH }]}>
        {profile.user.avatar ? (
          <ImageBackground
            source={{ uri: toAbsoluteUrl(profile.user.avatar) }}
            style={styles.heroImage}
            imageStyle={styles.heroImageInner}
          >
            <View style={styles.heroTopScrim} pointerEvents="none" />
            <View style={styles.heroScrim} />
            <View style={styles.heroTextBlock}>
              <Text style={styles.heroName}>{profile.user.name}</Text>
              {locationDisplay ? (
                <Text style={styles.heroLocation} numberOfLines={2}>
                  {locationDisplay}
                </Text>
              ) : null}
            </View>
          </ImageBackground>
        ) : (
          <View style={[styles.heroImage, styles.heroPlaceholder]}>
            <View style={styles.heroTopScrim} pointerEvents="none" />
            <Text style={styles.heroInitialsLarge}>{initials}</Text>
            <View style={styles.heroScrim} />
            <View style={styles.heroTextBlock}>
              <Text style={styles.heroName}>{profile.user.name}</Text>
              {locationDisplay ? (
                <Text style={styles.heroLocation} numberOfLines={2}>
                  {locationDisplay}
                </Text>
              ) : null}
            </View>
          </View>
        )}
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

      <View style={styles.actionRow}>
        {profile.user.relationship !== "self" ? (
          <Pressable
            style={[styles.primaryAction, busy && styles.disabledButton]}
            onPress={() => void handleFollowAction()}
            disabled={busy}
          >
            <Text style={styles.primaryActionText}>{followButtonText()}</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.secondaryAction} onPress={() => void handleShareProfile()}>
          <Text style={styles.secondaryActionText}>Share profile</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 32 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  hero: {
    width: "100%",
    backgroundColor: colors.surface,
  },
  heroImage: {
    flex: 1,
    width: "100%",
    justifyContent: "flex-end",
  },
  heroImageInner: {
    resizeMode: "cover",
  },
  heroTopScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 140,
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  heroPlaceholder: {
    backgroundColor: colors.fairwaySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  heroInitialsLarge: {
    position: "absolute",
    color: colors.fairway,
    fontWeight: "800",
    fontSize: 72,
    letterSpacing: -2,
  },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    top: "45%",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  heroTextBlock: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 12,
    gap: 6,
  },
  heroName: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 30,
    letterSpacing: -0.5,
  },
  heroLocation: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 16,
    fontWeight: "600",
  },
  statsGrid: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingVertical: 20,
    paddingHorizontal: 8,
    backgroundColor: colors.background,
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
  actionRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 20,
    alignSelf: "stretch",
  },
  primaryAction: {
    flex: 1,
    backgroundColor: colors.fairway,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryActionText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  secondaryAction: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryActionText: { color: colors.text, fontWeight: "800", fontSize: 16 },
  errorText: { color: colors.danger, paddingHorizontal: 16, marginTop: 8 },
  disabledButton: { opacity: 0.6 },
});
