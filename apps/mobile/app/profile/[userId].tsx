import { Stack, useLocalSearchParams } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { apiDelete, apiPost, toAbsoluteUrl } from "../../lib/api";
import {
  fetchPublicProfileAndCache,
  getCachedPublicProfile,
  PublicProfile,
  setCachedPublicProfile,
} from "../../lib/public-profile-cache";
import { colors } from "../../lib/theme";

export default function PublicProfileScreen() {
  const { userId, userName, userAvatar } = useLocalSearchParams<{
    userId: string;
    userName?: string;
    userAvatar?: string;
  }>();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const seededProfile = useMemo<PublicProfile | null>(() => {
    if (!userId) return null;
    const seededName = Array.isArray(userName) ? userName[0] : userName;
    const seededAvatarRaw = Array.isArray(userAvatar) ? userAvatar[0] : userAvatar;
    const seededAvatar = seededAvatarRaw && seededAvatarRaw.length > 0 ? seededAvatarRaw : null;
    if (!seededName && !seededAvatar) return null;
    return {
      user: {
        id: userId,
        name: seededName ?? "Profile",
        avatar: seededAvatar,
        handicap: null,
        location: null,
        followVisibility: "public",
        relationship: "none",
        followersCount: 0,
        followingCount: 0,
      },
      friends: [],
    };
  }, [userAvatar, userId, userName]);
  const cachedProfile = useMemo(() => (userId ? getCachedPublicProfile(userId) : null), [userId]);
  const [loading, setLoading] = useState(!cachedProfile && !seededProfile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(cachedProfile ?? seededProfile);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

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

  useEffect(() => {
    const cached = userId ? getCachedPublicProfile(userId) : null;
    setProfile(cached ?? seededProfile);
    setLoading(!cached && !seededProfile);
    void loadProfile({ silent: true });
  }, [seededProfile, userId]);

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
  const profileMetaLine =
    handicapDisplay && locationDisplay
      ? `Handicap ${handicapDisplay} • ${locationDisplay}`
      : handicapDisplay
        ? `Handicap ${handicapDisplay}`
        : locationDisplay;

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
      message: `Check out ${profile.user.name}'s profile on Partee.`,
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: profile.user.name || "Profile" }} />
      <View style={styles.header}>
        {profile.user.avatar ? (
          <Image source={{ uri: toAbsoluteUrl(profile.user.avatar) }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarInitials}>{initials}</Text>
          </View>
        )}
        <Text style={styles.name}>{profile.user.name}</Text>
        {profileMetaLine ? <Text style={styles.profileInfoLine}>{profileMetaLine}</Text> : null}
        <View style={styles.statsRow}>
          <Text style={styles.statText}>{profile.user.followersCount} followers</Text>
          <Text style={styles.statDot}>•</Text>
          <Text style={styles.statText}>{profile.user.followingCount} following</Text>
        </View>
      </View>

      <View style={styles.actionRow}>
        {profile.user.relationship !== "self" ? (
          <Pressable
            style={styles.primaryAction}
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

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Friends</Text>
        {profile.friends.length === 0 ? (
          <Text style={styles.cardHint}>No golf friends yet.</Text>
        ) : (
          profile.friends.map((friend) => (
            <View key={friend.id} style={styles.friendRow}>
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
                <Text style={styles.friendSub}>Paired {friend.count} time{friend.count === 1 ? "" : "s"}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  header: { alignItems: "center", gap: 6 },
  avatar: { width: 84, height: 84, borderRadius: 999, backgroundColor: "#dfe6df" },
  avatarPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.fairwaySoft,
  },
  avatarInitials: { color: colors.fairway, fontWeight: "700", fontSize: 20 },
  name: { color: colors.text, fontWeight: "700", fontSize: 22 },
  profileInfoLine: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  statsRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  statText: { color: colors.muted, fontWeight: "600", fontSize: 12 },
  statDot: { color: colors.muted, fontSize: 12 },
  actionRow: { flexDirection: "row", justifyContent: "center", gap: 8, flexWrap: "wrap" },
  primaryAction: {
    backgroundColor: colors.fairway,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  primaryActionText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  secondaryAction: {
    backgroundColor: "#ece8e1",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  secondaryActionText: { color: colors.text, fontWeight: "700", fontSize: 12 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
    gap: 8,
    backgroundColor: colors.surface,
  },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  cardHint: { color: colors.muted, fontSize: 12 },
  friendRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  friendAvatar: { width: 34, height: 34, borderRadius: 999 },
  friendInitial: { color: colors.fairway, fontWeight: "700", fontSize: 13 },
  friendMeta: { flex: 1 },
  friendName: { color: colors.text, fontWeight: "700" },
  friendSub: { color: colors.muted, fontSize: 12 },
  errorText: { color: colors.danger },
  disabledButton: { opacity: 0.6 },
});
