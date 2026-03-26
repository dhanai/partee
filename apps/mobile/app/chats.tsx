import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, Stack } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { NotificationMustardDot } from "../components/notification-mustard-dot";
import { apiGet, toAbsoluteUrl } from "../lib/api";
import { useChatUnread } from "../lib/chat-unread-context";
import { colors } from "../lib/theme";

type ConversationRow = {
  id: string;
  type: "dm" | "round" | "group";
  roundId: string | null;
  groupId: string | null;
  title: string;
  imageUrl: string | null;
  participantAvatars: string[];
  isUnread: boolean;
  roundMode: string | null;
  roundInviteToken: string | null;
  lastMessage: {
    body: string;
    senderName: string;
    senderId: string;
    createdAt: string;
  };
  participantCount: number;
};

type ConversationsResponse = { conversations: ConversationRow[] };

const AVATAR_SIZE = 48;

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

function ChatAvatar({ item }: { item: ConversationRow }) {
  if (item.type === "dm" && item.imageUrl) {
    return (
      <Image
        source={toAbsoluteUrl(item.imageUrl)}
        style={styles.avatar}
        contentFit="cover"
        transition={0}
      />
    );
  }

  if (item.type === "round" && item.roundMode === "scheduled" && item.imageUrl) {
    return (
      <Image
        source={toAbsoluteUrl(item.imageUrl)}
        style={styles.avatar}
        contentFit="cover"
        transition={0}
      />
    );
  }

  const avatars = item.participantAvatars;

  if (avatars.length === 0) {
    return (
      <View style={[styles.avatar, styles.avatarPlaceholder]}>
        <Ionicons
          name={item.type === "dm" ? "person-outline" : "people-outline"}
          size={22}
          color={colors.muted}
        />
      </View>
    );
  }

  if (avatars.length === 1) {
    return (
      <Image
        source={toAbsoluteUrl(avatars[0])}
        style={styles.avatar}
        contentFit="cover"
        transition={0}
      />
    );
  }

  if (avatars.length === 2) {
    return (
      <View style={styles.avatarGroup}>
        <Image
          source={toAbsoluteUrl(avatars[0])}
          style={styles.avatarTwo1}
          contentFit="cover"
          transition={0}
        />
        <Image
          source={toAbsoluteUrl(avatars[1])}
          style={styles.avatarTwo2}
          contentFit="cover"
          transition={0}
        />
      </View>
    );
  }

  return (
    <View style={styles.avatarGroup}>
      <Image
        source={toAbsoluteUrl(avatars[0])}
        style={styles.avatarThreeLarge}
        contentFit="cover"
        transition={0}
      />
      <View style={styles.avatarThreeStack}>
        <Image
          source={toAbsoluteUrl(avatars[1])}
          style={styles.avatarThreeSmall}
          contentFit="cover"
          transition={0}
        />
        <Image
          source={toAbsoluteUrl(avatars[2])}
          style={styles.avatarThreeSmall}
          contentFit="cover"
          transition={0}
        />
      </View>
    </View>
  );
}

export default function ChatsScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const { reportConversations } = useChatUnread();

  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadChats = useCallback(async () => {
    try {
      setError(null);
      const authToken = await getTokenRef.current();
      const result = await apiGet<ConversationsResponse>("/api/conversations", authToken);
      const convos = result.conversations;
      reportConversations(convos.map((c) => ({ id: c.id, isUnread: c.isUnread })));
      setRows(convos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load chats.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [reportConversations]);

  useFocusEffect(
    useCallback(() => {
      void loadChats();
    }, [loadChats]),
  );

  const renderItem = useCallback(
    ({ item }: { item: ConversationRow }) => {
      const unread = item.isUnread;
      return (
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => {
            if (item.roundInviteToken) {
              router.push({
                pathname: "/round/[token]/chat",
                params: { token: item.roundInviteToken },
              });
            } else {
              router.push({
                pathname: "/conversation/[id]/chat",
                params: { id: item.id },
              });
            }
          }}
        >
          <ChatAvatar item={item} />
          <View style={styles.textCol}>
            <Text
              style={[styles.chatTitle, unread && styles.chatTitleUnread]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <Text
              style={[styles.preview, unread && styles.previewUnread]}
              numberOfLines={1}
            >
              {item.lastMessage.senderName}: {item.lastMessage.body}
            </Text>
          </View>
          <View style={styles.trailingCol}>
            <Text style={styles.time}>
              {relativeTime(item.lastMessage.createdAt)}
            </Text>
            {unread ? <NotificationMustardDot style={styles.unreadDot} /> : null}
          </View>
        </Pressable>
      );
    },
    [router],
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: "Chats",
          headerRight: () => (
            <Pressable
              onPress={() => router.push("/new-chat")}
              hitSlop={8}
              style={{ marginRight: 2 }}
            >
              <Ionicons name="create-outline" size={22} color={colors.text} style={{ marginTop: -2, marginRight: -5 }} />
            </Pressable>
          ),
        }}
      />
      {loading && rows.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.fairway} />
        </View>
      ) : error && rows.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void loadChats()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          style={styles.list}
          contentContainerStyle={
            rows.length === 0 ? styles.emptyContainer : styles.listContent
          }
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void loadChats();
          }}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="chatbubbles-outline" size={40} color={colors.border} />
              <Text style={styles.emptyTitle}>No chats yet</Text>
              <Text style={styles.emptySubtitle}>
                Start a conversation with a friend or join a round to chat with your group.
              </Text>
            </View>
          }
        />
      )}
    </>
  );
}

const HALF = AVATAR_SIZE / 2;
const SMALL = (AVATAR_SIZE - 4) / 2;

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.background },
  listContent: { paddingVertical: 4 },
  emptyContainer: { flex: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  rowPressed: { backgroundColor: colors.fairwaySoft },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarPlaceholder: {
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarGroup: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    flexDirection: "row",
    overflow: "hidden",
  },
  avatarTwo1: {
    width: HALF,
    height: AVATAR_SIZE,
    borderTopLeftRadius: AVATAR_SIZE / 2,
    borderBottomLeftRadius: AVATAR_SIZE / 2,
  },
  avatarTwo2: {
    width: HALF,
    height: AVATAR_SIZE,
    borderTopRightRadius: AVATAR_SIZE / 2,
    borderBottomRightRadius: AVATAR_SIZE / 2,
  },
  avatarThreeLarge: {
    width: HALF,
    height: AVATAR_SIZE,
    borderTopLeftRadius: AVATAR_SIZE / 2,
    borderBottomLeftRadius: AVATAR_SIZE / 2,
  },
  avatarThreeStack: {
    width: HALF,
    height: AVATAR_SIZE,
    justifyContent: "space-between",
  },
  avatarThreeSmall: {
    width: HALF,
    height: SMALL,
    borderTopRightRadius: SMALL,
    borderBottomRightRadius: SMALL,
  },
  textCol: { flex: 1, gap: 2, minWidth: 0 },
  chatTitle: { fontSize: 15, fontWeight: "600", color: colors.text },
  chatTitleUnread: { fontWeight: "800" },
  preview: { fontSize: 14, color: colors.muted },
  previewUnread: { color: colors.text, fontWeight: "600" },
  trailingCol: { alignItems: "flex-end", gap: 6, flexShrink: 0 },
  time: { fontSize: 12, color: colors.muted },
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
  errorText: { color: colors.muted, textAlign: "center", paddingHorizontal: 32 },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.fairway,
  },
  retryText: { color: "#fff", fontWeight: "600" },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 40,
  },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: colors.text, marginTop: 4 },
  emptySubtitle: { fontSize: 14, color: colors.muted, textAlign: "center" },
});
