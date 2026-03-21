import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import {
  ActivityIndicator,
  Dimensions,
  ImageBackground,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { apiGet, toAbsoluteUrl } from "../../lib/api";
import { getCachedMeProfile, setCachedMeProfile } from "../../lib/me-profile-cache";
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

const WINDOW_HEIGHT = Dimensions.get("window").height;

function profileHeroHeight() {
  return Math.min(420, Math.max(280, Math.round(WINDOW_HEIGHT * 0.44)));
}

export default function ProfileScreen() {
  const navigation = useNavigation();
  const router = useRouter();
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

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    navigation.setOptions({
      headerRightContainerStyle: {
        paddingRight: 12,
      },
      headerRight: () => (
        <Pressable
          style={styles.headerSettingsBtn}
          onPress={() => router.push("/settings")}
          accessibilityLabel="Open settings"
        >
          <Ionicons name="options-outline" size={18} color={colors.fairway} />
        </Pressable>
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

  const initials = useMemo(() => {
    if (!name.trim()) return "P";
    return name
      .trim()
      .split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }, [name]);

  const handicapDisplay = handicap.trim();
  const locationDisplay = location.trim();
  const heroH = profileHeroHeight();

  async function handleShareProfile() {
    const profileLabel = name.trim() || "Parfade golfer";
    await Share.share({
      message: `Check out ${profileLabel}'s profile on Parfade.`,
    });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.fairway} />
        </View>
      ) : (
        <View style={styles.profileLayout}>
          <View style={[styles.hero, { height: heroH }]}>
            {avatar ? (
              <ImageBackground
                source={{ uri: toAbsoluteUrl(avatar) }}
                style={styles.heroImage}
                imageStyle={styles.heroImageInner}
              >
                <View style={styles.heroScrim} />
                <View style={styles.heroTextBlock}>
                  <Text style={styles.heroName}>{name || "Your profile"}</Text>
                  {locationDisplay ? (
                    <Text style={styles.heroLocation} numberOfLines={2}>
                      {locationDisplay}
                    </Text>
                  ) : null}
                </View>
              </ImageBackground>
            ) : (
              <View style={[styles.heroImage, styles.heroPlaceholder]}>
                <Text style={styles.heroInitialsLarge}>{initials}</Text>
                <View style={styles.heroScrim} />
                <View style={styles.heroTextBlock}>
                  <Text style={styles.heroName}>{name || "Your profile"}</Text>
                  {locationDisplay ? (
                    <Text style={styles.heroLocation} numberOfLines={2}>
                      {locationDisplay}
                    </Text>
                  ) : null}
                </View>
              </View>
            )}
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

          <View style={styles.actionRow}>
            <Pressable style={styles.actionPrimary} onPress={() => router.push("/profile/edit")}>
              <Text style={styles.actionPrimaryText}>Edit profile</Text>
            </Pressable>
            <Pressable style={styles.actionSecondary} onPress={() => void handleShareProfile()}>
              <Text style={styles.actionSecondaryText}>Share profile</Text>
            </Pressable>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 40 },
  loadingRow: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
  },
  profileLayout: { gap: 0 },
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
    paddingBottom: 24,
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
  },
  actionPrimary: {
    flex: 1,
    backgroundColor: colors.fairway,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  actionPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  actionSecondary: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionSecondaryText: { color: colors.text, fontWeight: "800", fontSize: 16 },
  errorText: { color: colors.danger },
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
