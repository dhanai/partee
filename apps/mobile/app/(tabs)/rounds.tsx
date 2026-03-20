import { useFocusEffect, useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { apiGet, toAbsoluteUrl } from "../../lib/api";
import { colors } from "../../lib/theme";
import { MineRound } from "../../types/round";

type MineResponse = {
  hosting: { upcoming: MineRound[]; past: MineRound[] };
  joined: { upcoming: MineRound[]; past: MineRound[] };
};

export default function MyRoundsScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const [hosting, setHosting] = useState<MineRound[]>([]);
  const [joined, setJoined] = useState<MineRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRightContainerStyle: {
        paddingRight: 12,
      },
      headerRight: () => (
        <Pressable
          style={styles.headerBellBtn}
          onPress={() => {
            setNotificationsOpen(true);
            Animated.timing(notificationsAnim, {
              toValue: 1,
              duration: 220,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }).start();
          }}
          accessibilityLabel="Open notifications"
        >
          <Ionicons name="notifications-outline" size={18} color={colors.fairway} />
        </Pressable>
      ),
    });
  }, [navigation, notificationsAnim]);

  const loadRounds = useCallback(async () => {
    try {
      setError(null);
      const authToken = await getTokenRef.current();
      const data = await apiGet<MineResponse>("/api/rounds/mine", authToken);
      setHosting(data.hosting.upcoming);
      setJoined(data.joined.upcoming);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unable to load rounds.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadRounds();
    }, [loadRounds]),
  );

  function formatWhen(round: MineRound) {
    const effectiveDate = new Date(round.teeTime ?? round.targetDate);
    const dateText = effectiveDate.toLocaleDateString();
    if (round.mode === "scheduled" && round.teeTime) {
      return `${dateText} at ${new Date(round.teeTime).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })}`;
    }
    if (round.mode === "planning") {
      const slot = round.preferredTimeWindow
        ? `${round.preferredTimeWindow.charAt(0).toUpperCase()}${round.preferredTimeWindow.slice(1)}`
        : "Time TBD";
      return slot;
    }
    const slot = round.preferredTimeWindow
      ? `${round.preferredTimeWindow.charAt(0).toUpperCase()}${round.preferredTimeWindow.slice(1)}`
      : "Time TBD";
    return `${dateText} • ${slot}`;
  }

  function closeNotifications() {
    Animated.timing(notificationsAnim, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setNotificationsOpen(false);
    });
  }

  function renderSpotCircles(round: MineRound) {
    const total = round.totalSpots ?? 0;
    const confirmed = round.confirmedPlayers ?? [];
    return (
      <View style={styles.spotCirclesRow}>
        {Array.from({ length: total }).map((_, idx) => {
          const player = confirmed[idx];
          if (player?.avatar) {
            return (
              <Image
                key={`${round.id}-spot-${idx}`}
                source={{ uri: toAbsoluteUrl(player.avatar) }}
                style={styles.spotAvatar}
              />
            );
          }
          if (player) {
            return (
              <View
                key={`${round.id}-spot-${idx}`}
                style={[styles.spotAvatar, styles.spotAvatarFilledFallback]}
              >
                <Text style={styles.spotAvatarInitial}>
                  {player.name.trim().charAt(0).toUpperCase() || "?"}
                </Text>
              </View>
            );
          }
          return (
            <View
              key={`${round.id}-spot-${idx}`}
              style={[styles.spotAvatar, styles.spotAvatarEmpty]}
            />
          );
        })}
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.fairway} />
      </View>
    );
  }

  const inviteNotifications = joined.filter(
    (round) => round.spotStatus === "invited" || round.spotStatus === "requested",
  );

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadRounds();
            }}
          />
        }
      >
        <Text style={styles.heading}>My rounds</Text>
        <Text style={styles.subheading}>Hosting and claimed upcoming rounds.</Text>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Text style={styles.sectionTitle}>Hosting</Text>
        {hosting.length === 0 ? (
          <Text style={styles.emptyText}>No upcoming rounds you are hosting.</Text>
        ) : (
          hosting.map((round) => (
            <Pressable
              key={round.id}
              style={[styles.card, round.mode === "planning" && styles.planningCard]}
              onPress={() =>
                router.push({
                  pathname: "/round/[token]",
                  params: { token: round.inviteToken },
                })
              }
            >
              <View style={styles.topRow}>
                <Text style={round.mode === "planning" ? styles.planDate : styles.cardTitle}>
                  {round.mode === "planning"
                    ? new Date(round.targetDate).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })
                    : (round.courseName ?? "Course TBD")}
                </Text>
                <Text style={styles.badgeMuted}>
                  {round.mode === "planning" ? "Planning round" : "Scheduled"}
                </Text>
              </View>
              <Text style={styles.meta}>{formatWhen(round)}</Text>
              <View style={styles.row}>
                {renderSpotCircles(round)}
              </View>
            </Pressable>
          ))
        )}

        <Text style={styles.sectionTitle}>Joined</Text>
        {joined.length === 0 ? (
          <Text style={styles.emptyText}>No upcoming rounds you have claimed.</Text>
        ) : (
          joined.map((round) => (
            <Pressable
              key={round.id}
              style={[styles.card, round.mode === "planning" && styles.planningCard]}
              onPress={() =>
                router.push({
                  pathname: "/round/[token]",
                  params: { token: round.inviteToken },
                })
              }
            >
              <View style={styles.topRow}>
                <Text style={round.mode === "planning" ? styles.planDate : styles.cardTitle}>
                  {round.mode === "planning"
                    ? new Date(round.targetDate).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })
                    : (round.courseName ?? "Course TBD")}
                </Text>
                <Text style={styles.badgeMuted}>
                  {round.mode === "planning" ? "Planning round" : "Scheduled"}
                </Text>
              </View>
              <Text style={styles.meta}>{formatWhen(round)}</Text>
              <View style={styles.row}>
                {round.spotStatus === "requested" ? (
                  <Text style={styles.badgeMutedSub}>Pending</Text>
                ) : null}
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>

      {notificationsOpen ? (
        <View style={styles.notificationsOverlay}>
          <Pressable style={styles.notificationsBackdrop} onPress={closeNotifications} />
          <Animated.View
            style={[
              styles.notificationsPanel,
              {
                transform: [
                  {
                    translateX: notificationsAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [360, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.notificationsHeader}>
              <Text style={styles.notificationsTitle}>Notifications</Text>
              <Pressable onPress={closeNotifications} style={styles.closeBtn}>
                <Ionicons name="close" size={18} color={colors.text} />
              </Pressable>
            </View>
            <Text style={styles.notificationsSub}>Invites and updates.</Text>
            {inviteNotifications.length === 0 ? (
              <Text style={styles.emptyText}>No new invites right now.</Text>
            ) : (
              <View style={styles.notificationsList}>
                {inviteNotifications.map((round) => (
                  <Pressable
                    key={`invite-${round.id}`}
                    style={styles.notificationCard}
                    onPress={() => {
                      closeNotifications();
                      router.push({
                        pathname: "/round/[token]",
                        params: { token: round.inviteToken },
                      });
                    }}
                  >
                    <Text style={styles.notificationTitle}>{round.courseName ?? "Round invite"}</Text>
                    <Text style={styles.notificationMeta}>{formatWhen(round)}</Text>
                    <Text style={styles.notificationPill}>
                      {round.spotStatus === "requested" ? "Request pending" : "Invited"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 32, gap: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  heading: { fontSize: 28, fontWeight: "700", color: colors.text },
  subheading: { color: colors.muted, marginBottom: 8 },
  sectionTitle: { fontSize: 17, color: colors.text, fontWeight: "700", marginTop: 8 },
  emptyText: { color: colors.muted, marginBottom: 4 },
  headerBellBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 11,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  planningCard: {
    borderColor: "#a8d4b2",
    borderStyle: "dashed",
    backgroundColor: "#fbfffc",
  },
  cardTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  planDate: { fontSize: 18, fontWeight: "700", color: colors.text, letterSpacing: -0.2 },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  meta: { color: colors.muted },
  row: { flexDirection: "row", justifyContent: "space-between" },
  badge: {
    backgroundColor: colors.fairwaySoft,
    color: colors.fairway,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
    fontWeight: "600",
  },
  spotCirclesRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  spotAvatar: { width: 24, height: 24, borderRadius: 999 },
  spotAvatarEmpty: {
    backgroundColor: "#e9e5de",
    borderWidth: 1,
    borderColor: "#ddd6cc",
  },
  spotAvatarFilledFallback: {
    backgroundColor: colors.fairwaySoft,
    borderWidth: 1,
    borderColor: "#cfe4d4",
    alignItems: "center",
    justifyContent: "center",
  },
  spotAvatarInitial: { color: colors.fairway, fontSize: 11, fontWeight: "700" },
  badgeMuted: {
    backgroundColor: "#f1efea",
    color: colors.muted,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
    fontWeight: "600",
  },
  badgeMutedSub: {
    backgroundColor: "#f1efea",
    color: colors.muted,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
    fontWeight: "600",
    fontSize: 12,
  },
  errorText: {
    color: colors.danger,
    backgroundColor: "#fee4e2",
    padding: 10,
    borderRadius: 12,
    marginBottom: 8,
  },
  notificationsOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  notificationsBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.22)",
  },
  notificationsPanel: {
    width: "84%",
    maxWidth: 360,
    height: "100%",
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    paddingTop: 58,
    paddingHorizontal: 14,
    gap: 6,
  },
  notificationsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  notificationsTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
  notificationsSub: { color: colors.muted, marginBottom: 10 },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#f6f3ee",
  },
  notificationsList: { gap: 8 },
  notificationCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#faf8f5",
    padding: 10,
    gap: 4,
  },
  notificationTitle: { color: colors.text, fontWeight: "700" },
  notificationMeta: { color: colors.muted, fontSize: 12 },
  notificationPill: {
    alignSelf: "flex-start",
    marginTop: 2,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.fairwaySoft,
    color: colors.fairway,
    fontSize: 11,
    fontWeight: "700",
    overflow: "hidden",
  },
});
