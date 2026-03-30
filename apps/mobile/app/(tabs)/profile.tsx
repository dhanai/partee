import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { InitialAvatar } from "../../components/initial-avatar";
import { ProfileOpenRoundsSection } from "../../components/profile-open-rounds-section";
import { ProfileStatCategoryCards } from "../../components/profile-stat-category-cards";
import { claimRsvpButtonStyles as btn } from "../../lib/claim-rsvp-button-styles";
import { apiGet, publicWebOrigin, toAbsoluteUrl } from "../../lib/api";
import { getCachedMeProfile, setCachedMeProfile } from "../../lib/me-profile-cache";
import {
  ensureSkinsFourthColumn,
  fetchUserStats,
  type ProfileStatsGrouped,
} from "../../lib/profile-stats-api";
import { colors } from "../../lib/theme";

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

const AVATAR_RADIUS = 28;

export default function ProfileScreen() {
  const navigation = useNavigation();
  const router = useRouter();
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
  const [groupedStats, setGroupedStats] = useState<ProfileStatsGrouped | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

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
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : "Unable to load profile.");
    } finally {
      setLoading(false);
    }
  }

  async function loadGroupedStats(options?: { silent?: boolean }) {
    const silent = Boolean(options?.silent);
    if (!silent) setStatsLoading(true);
    try {
      const token = await getTokenRef.current();
      const { grouped, stats } = await fetchUserStats(token, "me");
      setGroupedStats(ensureSkinsFourthColumn(grouped, stats));
    } catch {
      setGroupedStats(null);
    } finally {
      setStatsLoading(false);
    }
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
      void loadGroupedStats({ silent: Boolean(cached) });
    }, []),
  );

  const handicapDisplay = handicap.trim();
  const locationDisplay = location.trim();

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
              <ProfileOpenRoundsSection userId={myUserId} viewerIsSelf />
              <ProfileStatCategoryCards
                userId={myUserId}
                grouped={groupedStats}
                loading={statsLoading}
              />
            </>
          ) : null}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      )}
    </ScrollView>
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
});
