import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { apiDelete, apiGet, toAbsoluteUrl } from "../lib/api";
import { fetchRoundDetailsAndCache } from "../lib/round-details-cache";
import { colors } from "../lib/theme";
import { InitialAvatar } from "../components/initial-avatar";

type Participant = { id: string; name: string; avatar: string | null };

type ChatInfoData = {
  type: string;
  title: string;
  roundMode: string | null;
  participants: Participant[];
  roundDetails: {
    courseName: string | null;
    teeTime: string | null;
    targetDate: string;
    status: string;
  } | null;
};

function abbreviateName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return name.trim();
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  return `${first} ${last.charAt(0).toUpperCase()}.`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function ChatInfoScreen() {
  const {
    conversationId,
    roundToken,
    chatType,
    onlineIds: onlineIdsJson,
  } = useLocalSearchParams<{
    conversationId?: string;
    roundToken?: string;
    chatType?: string;
    onlineIds?: string;
  }>();

  const onlineUserIds = useMemo<Set<string>>(() => {
    if (!onlineIdsJson) return new Set();
    try { return new Set(JSON.parse(onlineIdsJson)); } catch { return new Set(); }
  }, [onlineIdsJson]);
  const router = useRouter();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [data, setData] = useState<ChatInfoData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const authToken = await getTokenRef.current();

      if (conversationId) {
        const res = await apiGet<ChatInfoData>(
          `/api/conversations/${conversationId}`,
          authToken,
        );
        setData(res);
      } else if (roundToken) {
        const round = await fetchRoundDetailsAndCache(roundToken, authToken);
        setData({
          type: "round",
          title: round.courseName || "Group chat",
          roundMode: round.mode,
          participants: [
            { id: round.hostId, name: round.hostName, avatar: round.hostAvatar },
            ...round.confirmedPlayers.filter((p) => p.id !== round.hostId),
          ],
          roundDetails: {
            courseName: round.courseName,
            teeTime: round.teeTime,
            targetDate: round.targetDate,
            status: round.status,
          },
        });
      }
    } catch {
      /* best-effort */
    } finally {
      setLoading(false);
    }
  }, [conversationId, roundToken]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.fairway} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>Unable to load details.</Text>
      </View>
    );
  }

  const handleLeave = () => {
    Alert.alert("Leave chat", `Remove "${data.title}" from your chats?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          if (!conversationId) return;
          try {
            const token = await getTokenRef.current();
            await apiDelete(`/api/conversations/${conversationId}`, token);
            router.dismissAll();
            router.replace("/chats");
          } catch {
            Alert.alert("Error", "Unable to leave this chat.");
          }
        },
      },
    ]);
  };

  const isRound = data.type === "round" && data.roundDetails;

  return (
    <View style={styles.root}>
      {isRound && data.roundDetails ? (
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Ionicons name="golf-outline" size={18} color={colors.fairway} />
            <Text style={styles.detailLabel}>
              {data.roundMode === "scheduled" ? "Scheduled Round" : "Planning Round"}
            </Text>
          </View>
          {data.roundDetails.courseName ? (
            <View style={styles.detailRow}>
              <Ionicons name="location-outline" size={18} color={colors.muted} />
              <Text style={styles.detailValue}>{data.roundDetails.courseName}</Text>
            </View>
          ) : null}
          <View style={styles.detailRow}>
            <Ionicons name="calendar-outline" size={18} color={colors.muted} />
            <Text style={styles.detailValue}>
              {formatDate(data.roundDetails.teeTime ?? data.roundDetails.targetDate)}
            </Text>
          </View>
          {data.roundDetails.teeTime ? (
            <View style={styles.detailRow}>
              <Ionicons name="time-outline" size={18} color={colors.muted} />
              <Text style={styles.detailValue}>
                {formatTime(data.roundDetails.teeTime)}
              </Text>
            </View>
          ) : null}
          <View style={styles.detailRow}>
            <Ionicons name="flag-outline" size={18} color={colors.muted} />
            <Text style={styles.detailValue}>
              {data.roundDetails.status === "completed"
                ? "Completed"
                : data.roundDetails.status === "confirmed"
                  ? "Confirmed"
                  : "Forming"}
            </Text>
          </View>
        </View>
      ) : null}

      <Text style={styles.sectionHeader}>
        {data.type === "group"
          ? `${data.participants.length} Members`
          : `${data.participants.length} Participants`}
      </Text>

      <FlatList
        data={[...data.participants].sort((a, b) => {
          const aOn = onlineUserIds.has(a.id) ? 0 : 1;
          const bOn = onlineUserIds.has(b.id) ? 0 : 1;
          return aOn - bOn;
        })}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => {
          const isOnline = onlineUserIds.has(item.id);
          return (
            <Pressable
              style={({ pressed }) => [styles.participantRow, pressed && styles.participantRowPressed]}
              onPress={() =>
                router.push({
                  pathname: "/profile/[userId]",
                  params: {
                    userId: item.id,
                    userName: item.name,
                    userAvatar: item.avatar ?? "",
                  },
                })
              }
            >
              <View style={styles.avatarWrap}>
                {item.avatar ? (
                  <Image
                    source={toAbsoluteUrl(item.avatar)}
                    style={styles.participantAvatar}
                    contentFit="cover"
                    transition={0}
                  />
                ) : (
                  <InitialAvatar name={item.name} size={40} maxInitials={2} />
                )}
                {isOnline ? <View style={styles.onlineDot} /> : null}
              </View>
              <Text style={styles.participantName}>{abbreviateName(item.name)}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.border} />
            </Pressable>
          );
        }}
        style={styles.list}
        contentContainerStyle={styles.listContent}
      />

      {conversationId ? (
        <Pressable style={styles.leaveBtn} onPress={handleLeave}>
          <Ionicons name="exit-outline" size={18} color={colors.danger} />
          <Text style={styles.leaveBtnText}>Leave chat</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const AVATAR_SIZE = 40;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
  },
  detailsCard: {
    margin: 16,
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  detailLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  detailValue: {
    fontSize: 14,
    color: colors.text,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 32,
  },
  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  participantRowPressed: {
    backgroundColor: colors.fairwaySoft,
  },
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  participantAvatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  participantPlaceholder: {
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  onlineDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#34C759",
    borderWidth: 2,
    borderColor: colors.background,
  },
  participantName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    color: colors.text,
  },
  leaveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginBottom: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  leaveBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.danger,
  },
});
