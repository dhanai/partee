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
  View,
} from "react-native";
import { apiGet, toAbsoluteUrl } from "../../lib/api";
import { getCachedMeProfile, setCachedMeProfile } from "../../lib/me-profile-cache";
import { prefetchPublicProfile } from "../../lib/public-profile-cache";
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
  };
};

type ProfileNetworkResponse = {
  friends: Array<{
    id: string;
    name: string;
    avatar: string | null;
    handicap: string | null;
  }>;
};

export default function ProfileScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const [loading, setLoading] = useState(true);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [handicap, setHandicap] = useState("");
  const [location, setLocation] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [friends, setFriends] = useState<ProfileNetworkResponse["friends"]>([]);

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
  }

  async function loadProfile(options?: { silent?: boolean }) {
    const silent = Boolean(options?.silent);
    if (!silent) {
      setLoading(true);
      setFriendsLoading(true);
    }
    setError(null);
    try {
      const token = await getTokenRef.current();
      const [json, network] = await Promise.all([
        apiGet<MeResponse>("/api/users/me", token),
        apiGet<ProfileNetworkResponse>("/api/users/me/network", token),
      ]);
      applyMeUser(json.user);
      setFriends(network.friends ?? []);
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : "Unable to load profile.");
    } finally {
      setLoading(false);
      setFriendsLoading(false);
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
  const profileMetaLine =
    handicapDisplay && locationDisplay
      ? `Handicap ${handicapDisplay} • ${locationDisplay}`
      : handicapDisplay
        ? `Handicap ${handicapDisplay}`
        : locationDisplay;

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
          <View style={styles.profileHeader}>
            {avatar ? (
              <Image source={{ uri: toAbsoluteUrl(avatar) }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
            <Text style={styles.profileName}>{name || "Your profile"}</Text>
            {profileMetaLine ? <Text style={styles.profileInfoLine}>{profileMetaLine}</Text> : null}
          </View>

          <View style={styles.actionRow}>
            <Pressable style={styles.actionPill} onPress={() => router.push("/profile/edit")}>
              <Text style={styles.actionPillText}>Edit profile</Text>
            </Pressable>
            <Pressable style={styles.actionPill} onPress={() => void handleShareProfile()}>
              <Text style={styles.actionPillText}>Share profile</Text>
            </Pressable>
          </View>

          <View style={styles.friendsSection}>
            <Text style={styles.sectionTitle}>Following</Text>
            {friendsLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.fairway} />
              </View>
            ) : friends.length === 0 ? (
              <Text style={styles.hint}>People you follow show up here — use Discover to find golfers.</Text>
            ) : (
              friends.map((friend) => (
                <Pressable
                  key={friend.id}
                  style={styles.friendRow}
                  onPressIn={() => prefetchPublicProfile(friend.id, () => getTokenRef.current())}
                  onPress={() =>
                    router.push({
                      pathname: "/profile/[userId]",
                      params: {
                        userId: friend.id,
                        userName: friend.name,
                        userAvatar: friend.avatar ?? "",
                      },
                    })
                  }
                >
                  {friend.avatar ? (
                    <Image source={{ uri: toAbsoluteUrl(friend.avatar) }} style={styles.friendAvatar} />
                  ) : (
                    <View style={[styles.friendAvatar, styles.avatarPlaceholder]}>
                      <Text style={styles.friendInitial}>
                        {friend.name.trim().charAt(0).toUpperCase() || "?"}
                      </Text>
                    </View>
                  )}
                  <View style={styles.friendMeta}>
                    <Text style={styles.friendName}>{friend.name}</Text>
                    {friend.handicap?.trim() ? (
                      <Text style={styles.friendSub}>
                        Handicap {friend.handicap.trim()}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              ))
            )}
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  loadingRow: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
  },
  profileLayout: { gap: 10 },
  profileHeader: {
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 999,
    backgroundColor: "#dfe6df",
  },
  avatarPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.fairwaySoft,
  },
  avatarInitials: {
    color: colors.fairway,
    fontWeight: "700",
    fontSize: 20,
  },
  profileName: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 22,
  },
  profileInfoLine: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 4,
    justifyContent: "center",
    alignSelf: "center",
  },
  actionPill: {
    backgroundColor: "#ece8e1",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionPillText: { color: colors.text, fontWeight: "700", fontSize: 12 },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 2,
  },
  hint: { color: colors.muted, fontSize: 12 },
  friendsSection: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
    gap: 8,
    backgroundColor: colors.surface,
  },
  friendRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  friendAvatar: { width: 34, height: 34, borderRadius: 999 },
  friendInitial: { color: colors.fairway, fontWeight: "700", fontSize: 13 },
  friendMeta: { flex: 1 },
  friendName: { color: colors.text, fontWeight: "700" },
  friendSub: { color: colors.muted, fontSize: 12 },
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
