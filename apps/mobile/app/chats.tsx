import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { RoundCoverImage } from "../components/round-cover-image";
import { NotificationMustardDot } from "../components/notification-mustard-dot";
import { apiGet, toAbsoluteUrl } from "../lib/api";
import { useChatUnread } from "../lib/chat-unread-context";
import { colors } from "../lib/theme";

type ChatRow = {
  inviteToken: string;
  courseName: string;
  imageUrl: string;
  lastChatMessage: {
    body: string;
    senderName: string;
    createdAt: string;
  };
};

type ChatsResponse = { chats: ChatRow[] };

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w`;
}

export default function ChatsScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const { isRoundChatUnread, reportRounds } = useChatUnread();

  const [chats, setChats] = useState<ChatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadChats = useCallback(async () => {
    try {
      setError(null);
      const authToken = await getTokenRef.current();
      const data = await apiGet<ChatsResponse>("/api/rounds/chats", authToken);
      setChats(data.chats);
      reportRounds(
        data.chats.map((c) => ({
          inviteToken: c.inviteToken,
          lastChatMessageAt: c.lastChatMessage.createdAt,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load chats.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [reportRounds]);

  useFocusEffect(
    useCallback(() => {
      void loadChats();
    }, [loadChats]),
  );

  const renderItem = useCallback(
    ({ item }: { item: ChatRow }) => {
      const unread = isRoundChatUnread(item.inviteToken);
      return (
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() =>
            router.push({
              pathname: "/round/[token]/chat",
              params: { token: item.inviteToken },
            })
          }
        >
          <RoundCoverImage
            recyclingKey={`chat-${item.inviteToken}`}
            uri={toAbsoluteUrl(item.imageUrl)}
            style={styles.avatar}
            transitionMs={200}
          />
          <View style={styles.textCol}>
            <Text
              style={[styles.courseName, unread && styles.courseNameUnread]}
              numberOfLines={1}
            >
              {item.courseName}
            </Text>
            <Text
              style={[styles.preview, unread && styles.previewUnread]}
              numberOfLines={1}
            >
              {item.lastChatMessage.senderName}: {item.lastChatMessage.body}
            </Text>
          </View>
          <View style={styles.trailingCol}>
            <Text style={styles.time}>
              {relativeTime(item.lastChatMessage.createdAt)}
            </Text>
            {unread ? <NotificationMustardDot style={styles.unreadDot} /> : null}
          </View>
        </Pressable>
      );
    },
    [isRoundChatUnread, router],
  );

  if (loading && chats.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.fairway} />
      </View>
    );
  }

  if (error && chats.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryBtn} onPress={() => void loadChats()}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      data={chats}
      keyExtractor={(item) => item.inviteToken}
      renderItem={renderItem}
      style={styles.list}
      contentContainerStyle={chats.length === 0 ? styles.emptyContainer : styles.listContent}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void loadChats();
      }}
      ListEmptyComponent={
        <View style={styles.emptyWrap}>
          <Ionicons name="chatbubbles-outline" size={40} color={colors.border} />
          <Text style={styles.emptyTitle}>No group chats yet</Text>
          <Text style={styles.emptySubtitle}>
            Join or create a round to start chatting with your group.
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingVertical: 4,
  },
  emptyContainer: {
    flex: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  rowPressed: {
    backgroundColor: colors.fairwaySoft,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  textCol: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  courseName: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  courseNameUnread: {
    fontWeight: "800",
  },
  preview: {
    fontSize: 14,
    color: colors.muted,
  },
  previewUnread: {
    color: colors.text,
    fontWeight: "600",
  },
  trailingCol: {
    alignItems: "flex-end",
    gap: 6,
    flexShrink: 0,
  },
  time: {
    fontSize: 12,
    color: colors.muted,
  },
  unreadDot: {
    position: "relative",
    top: 0,
    right: 0,
    borderColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    gap: 12,
  },
  errorText: {
    color: colors.muted,
    textAlign: "center",
    paddingHorizontal: 32,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.fairway,
  },
  retryText: {
    color: "#fff",
    fontWeight: "600",
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
    marginTop: 4,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
  },
});
