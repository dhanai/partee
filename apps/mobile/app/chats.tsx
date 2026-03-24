import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, Stack } from "expo-router";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { NotificationMustardDot } from "../components/notification-mustard-dot";
import { apiGet, toAbsoluteUrl } from "../lib/api";
import { useChatUnread } from "../lib/chat-unread-context";
import { colors } from "../lib/theme";

type ConversationRow = {
  id: string;
  type: "dm" | "round";
  roundId: string | null;
  title: string;
  imageUrl: string | null;
  participantAvatars: string[];
  isUnread: boolean;
  lastMessage: {
    body: string;
    senderName: string;
    senderId: string;
    createdAt: string;
  };
  participantCount: number;
};

type LegacyChatRow = {
  inviteToken: string;
  courseName: string;
  imageUrl: string | null;
  playerAvatars: string[];
  isUnread: boolean;
  lastChatMessage: {
    body: string;
    senderName: string;
    createdAt: string;
  };
};

type ConversationsResponse = { conversations: ConversationRow[] };
type LegacyChatsResponse = { chats: LegacyChatRow[] };

type UnifiedRow = {
  id: string;
  type: "dm" | "round";
  roundInviteToken?: string;
  conversationId?: string;
  title: string;
  imageUrl: string | null;
  avatars: string[];
  isUnread: boolean;
  lastMessage: { body: string; senderName: string; createdAt: string };
};

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
  const { reportRounds, reportConversations } = useChatUnread();

  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadChats = useCallback(async () => {
    try {
      setError(null);
      const authToken = await getTokenRef.current();

      const [convResult, legacyResult] = await Promise.allSettled([
        apiGet<ConversationsResponse>("/api/conversations", authToken),
        apiGet<LegacyChatsResponse>("/api/rounds/chats", authToken),
      ]);

      const unified: UnifiedRow[] = [];
      const seenRoundIds = new Set<string>();

      if (convResult.status === "fulfilled") {
        const convos = convResult.value.conversations;
        reportConversations(convos.map((c) => ({ id: c.id, isUnread: c.isUnread })));
        for (const c of convos) {
          if (c.roundId) seenRoundIds.add(c.roundId);
          unified.push({
            id: c.id,
            type: c.type,
            conversationId: c.id,
            title: c.title,
            imageUrl: c.imageUrl,
            avatars: c.participantAvatars,
            isUnread: c.isUnread,
            lastMessage: {
              body: c.lastMessage.body,
              senderName: c.lastMessage.senderName,
              createdAt: c.lastMessage.createdAt,
            },
          });
        }
      }

      if (legacyResult.status === "fulfilled") {
        const chats = legacyResult.value.chats;
        reportRounds(
          chats.map((c) => ({ inviteToken: c.inviteToken, isChatUnread: c.isUnread })),
        );
        for (const c of chats) {
          unified.push({
            id: `round-${c.inviteToken}`,
            type: "round",
            roundInviteToken: c.inviteToken,
            title: c.courseName,
            imageUrl: c.imageUrl,
            avatars: c.playerAvatars,
            isUnread: c.isUnread,
            lastMessage: {
              body: c.lastChatMessage.body,
              senderName: c.lastChatMessage.senderName,
              createdAt: c.lastChatMessage.createdAt,
            },
          });
        }
      }

      unified.sort(
        (a, b) =>
          new Date(b.lastMessage.createdAt).getTime() -
          new Date(a.lastMessage.createdAt).getTime(),
      );

      setRows(unified);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load chats.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [reportRounds, reportConversations]);

  useFocusEffect(
    useCallback(() => {
      void loadChats();
    }, [loadChats]),
  );

  const renderItem = useCallback(
    ({ item }: { item: UnifiedRow }) => {
      const unread = item.isUnread;
      return (
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => {
            if (item.conversationId) {
              router.push({
                pathname: "/conversation/[id]/chat",
                params: { id: item.conversationId },
              });
            } else if (item.roundInviteToken) {
              router.push({
                pathname: "/round/[token]/chat",
                params: { token: item.roundInviteToken },
              });
            }
          }}
        >
          {item.imageUrl ? (
            <Image
              source={{ uri: toAbsoluteUrl(item.imageUrl) }}
              style={styles.avatar}
            />
          ) : item.avatars.length > 0 ? (
            <View style={styles.avatarStack}>
              {item.avatars.slice(0, 3).map((uri, i) => (
                <Image
                  key={`${item.id}-${i}`}
                  source={{ uri: toAbsoluteUrl(uri) }}
                  style={[
                    styles.stackedAvatar,
                    { zIndex: 3 - i, marginLeft: i === 0 ? 0 : -10 },
                  ]}
                />
              ))}
            </View>
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Ionicons
                name={item.type === "dm" ? "person-outline" : "golf-outline"}
                size={22}
                color={colors.muted}
              />
            </View>
          )}
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
              style={{ marginRight: 4 }}
            >
              <Ionicons name="create-outline" size={24} color={colors.text} />
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
  avatarPlaceholder: {
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarStack: {
    flexDirection: "row",
    alignItems: "center",
    width: 48,
    height: 48,
  },
  stackedAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: colors.background,
  },
  textCol: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  chatTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  chatTitleUnread: {
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
