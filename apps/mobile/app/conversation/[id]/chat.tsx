import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChatBubbleRow } from "../../../components/chat-bubble-row";
import { ChatDateSeparator } from "../../../components/chat-date-separator";
import { RoundGroupChatComposer } from "../../../components/round-group-chat-composer";
import { TypingIndicator } from "../../../components/typing-indicator";
import { apiGet, apiPost, apiDelete } from "../../../lib/api";
import { useChatUnread } from "../../../lib/chat-unread-context";
import { GROUP_CHAT_COMPOSER_GAP } from "../../../lib/group-chat-layout-constants";
import { getCachedMeProfile } from "../../../lib/me-profile-cache";
import {
  getCachedMessages,
  mergeMessages,
  setCachedMessages,
  type CachedMessage,
} from "../../../lib/message-cache";
import { colors } from "../../../lib/theme";
import { useFullscreenChatKeyboard } from "../../../lib/use-group-chat-layout";
import { useTypingPresence } from "../../../lib/use-typing-presence";

type ConversationMessage = CachedMessage;

type MessagesResponse = {
  messages: ConversationMessage[];
  hasMore: boolean;
  viewerId: string;
};

const POLL_MS = 5000;

export default function ConversationChatScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const insets = useSafeAreaInsets();
  const { markConversationRead } = useChatUnread();

  const [msgs, setMsgs] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(
    () => getCachedMeProfile()?.id ?? null,
  );
  const [replyTo, setReplyTo] = useState<ConversationMessage | null>(null);
  const msgsRef = useRef<ConversationMessage[]>([]);
  msgsRef.current = msgs;
  const prevMsgCountRef = useRef(msgs.length);

  const { keyboardPadding, composerBottomPadding } = useFullscreenChatKeyboard(
    insets.bottom,
  );

  const me = getCachedMeProfile();
  const { typingNames, publishTyping } = useTypingPresence(
    conversationId,
    me?.id ?? null,
    me?.name ?? "You",
  );

  useEffect(() => {
    if (!conversationId) return;
    void (async () => {
      const cached = await getCachedMessages(conversationId);
      if (cached.length > 0) {
        setMsgs(cached);
        setLoading(false);
      }
    })();
  }, [conversationId]);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) return;
    try {
      const authToken = await getTokenRef.current();
      const data = await apiGet<MessagesResponse>(
        `/api/conversations/${conversationId}/messages`,
        authToken,
      );
      setViewerId(data.viewerId || getCachedMeProfile()?.id || null);
      setMsgs((prev) => {
        const merged = mergeMessages(prev, data.messages);
        void setCachedMessages(conversationId, merged);
        return merged;
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load chat.");
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    void fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    if (!conversationId) return;
    const id = setInterval(() => void fetchMessages(), POLL_MS);
    return () => clearInterval(id);
  }, [conversationId, fetchMessages]);

  useEffect(() => {
    if (!conversationId) return;
    const sendRead = async () => {
      markConversationRead(conversationId);
      try {
        const authToken = await getTokenRef.current();
        await apiPost(`/api/conversations/${conversationId}/read`, {}, authToken);
      } catch {
        /* best-effort */
      }
    };
    void sendRead();
    return () => void sendRead();
  }, [conversationId, markConversationRead]);

  const handleSend = useCallback(
    async (text: string): Promise<boolean> => {
      const trimmed = text.trim();
      if (!trimmed || !conversationId) return false;

      const me = getCachedMeProfile();
      const tempId = `optimistic-${Date.now()}`;
      const parentId = replyTo?.id ?? null;
      const parentPreview = replyTo
        ? {
            body: replyTo.body.length > 80 ? replyTo.body.slice(0, 77) + "…" : replyTo.body,
            senderName: replyTo.user.name,
          }
        : null;
      setReplyTo(null);

      const optimistic: ConversationMessage = {
        id: tempId,
        body: trimmed,
        createdAt: new Date().toISOString(),
        isMine: true,
        parentId,
        parentPreview,
        user: { id: me?.id ?? "", name: me?.name ?? "You", avatar: me?.avatar ?? null },
        reactions: {},
      };
      setMsgs((prev) => [...prev, optimistic]);

      try {
        const authToken = await getTokenRef.current();
        const data = await apiPost<{ message: ConversationMessage }>(
          `/api/conversations/${conversationId}/messages`,
          { body: trimmed, ...(parentId ? { parentId } : {}) },
          authToken,
        );
        setMsgs((prev) => {
          const without = prev.filter((m) => m.id !== tempId);
          if (without.some((m) => m.id === data.message.id)) return without;
          const merged = [...without, data.message];
          void setCachedMessages(conversationId, merged);
          return merged;
        });
        return true;
      } catch (e) {
        setMsgs((prev) => prev.filter((m) => m.id !== tempId));
        setError(e instanceof Error ? e.message : "Could not send.");
        return false;
      }
    },
    [conversationId, replyTo],
  );

  useEffect(() => {
    const prev = prevMsgCountRef.current;
    const next = msgs.length;
    prevMsgCountRef.current = next;
    if (next > prev && next - prev <= 3) {
      LayoutAnimation.configureNext({
        duration: 200,
        create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        update: { type: LayoutAnimation.Types.easeInEaseOut },
      });
    }
  }, [msgs.length]);

  const handleReaction = useCallback(
    (messageId: string, emoji: string, action: "add" | "remove") => {
      if (!conversationId || !viewerId) return;

      setMsgs((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const reactions = { ...m.reactions };
          const existing = reactions[emoji] ?? { count: 0, userIds: [] };
          if (action === "add") {
            if (!existing.userIds.includes(viewerId)) {
              reactions[emoji] = {
                count: existing.count + 1,
                userIds: [...existing.userIds, viewerId],
              };
            }
          } else {
            reactions[emoji] = {
              count: Math.max(0, existing.count - 1),
              userIds: existing.userIds.filter((id) => id !== viewerId),
            };
            if (reactions[emoji].count === 0) delete reactions[emoji];
          }
          return { ...m, reactions };
        }),
      );

      void (async () => {
        try {
          const authToken = await getTokenRef.current();
          if (action === "add") {
            await apiPost(
              `/api/conversations/${conversationId}/messages/${messageId}/reactions`,
              { emoji },
              authToken,
            );
          } else {
            await apiDelete(
              `/api/conversations/${conversationId}/messages/${messageId}/reactions?emoji=${emoji}`,
              authToken,
            );
          }
        } catch {
          /* revert on next poll */
        }
      })();
    },
    [conversationId, viewerId],
  );

  const resolveMine = useCallback(
    (m: ConversationMessage): boolean => {
      if (typeof m.isMine === "boolean") return m.isMine;
      const vid = viewerId?.trim();
      return vid != null && vid.length > 0 && m.user.id.trim() === vid;
    },
    [viewerId],
  );

  type ListItem =
    | { type: "message"; data: ConversationMessage }
    | { type: "date"; date: string };

  const invertedItems = useMemo(() => {
    const items: ListItem[] = [];
    const sorted = [...msgs].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    let lastDateStr = "";
    for (const m of sorted) {
      const dayStr = new Date(m.createdAt).toDateString();
      if (dayStr !== lastDateStr) {
        items.push({ type: "date", date: m.createdAt });
        lastDateStr = dayStr;
      }
      items.push({ type: "message", data: m });
    }
    return items.reverse();
  }, [msgs]);

  const handleReply = useCallback((msg: ConversationMessage) => {
    setReplyTo(msg);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.type === "date") {
        return <ChatDateSeparator date={item.date} />;
      }
      return (
        <ChatBubbleRow
          message={item.data}
          isMine={resolveMine(item.data)}
          conversationId={conversationId}
          viewerId={viewerId}
          onReaction={handleReaction}
          onReply={handleReply}
        />
      );
    },
    [resolveMine, conversationId, viewerId, handleReaction, handleReply],
  );
  const keyExtractor = useCallback(
    (item: ListItem) =>
      item.type === "date" ? `date-${item.date}` : item.data.id,
    [],
  );

  const composerStyles = useMemo(
    () => ({
      composerRow: cStyles.composerRow,
      input: cStyles.input,
      sendBtn: cStyles.sendBtn,
      sendBtnDisabled: cStyles.sendBtnDisabled,
    }),
    [],
  );

  return (
    <View style={[cStyles.root, { paddingBottom: keyboardPadding }]}>
      {loading && msgs.length === 0 ? (
        <View style={cStyles.loaderWrap}>
          <ActivityIndicator color={colors.fairway} size="small" />
        </View>
      ) : error && msgs.length === 0 ? (
        <Text style={cStyles.errorText}>{error}</Text>
      ) : msgs.length === 0 ? (
        <View style={cStyles.emptyFlex}>
          <Text style={cStyles.emptyText}>No messages yet. Say hi!</Text>
        </View>
      ) : (
        <FlatList
          data={invertedItems}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          inverted
          contentContainerStyle={cStyles.listContent}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
        />
      )}

      {error && msgs.length > 0 ? (
        <Text style={cStyles.errorText}>{error}</Text>
      ) : null}

      <View style={{ paddingBottom: composerBottomPadding }}>
        <TypingIndicator names={typingNames} />
        {replyTo ? (
          <View style={cStyles.replyBanner}>
            <View style={cStyles.replyBannerBar} />
            <View style={cStyles.replyBannerText}>
              <Text style={cStyles.replyBannerName} numberOfLines={1}>
                Replying to {replyTo.user.name}
              </Text>
              <Text style={cStyles.replyBannerBody} numberOfLines={1}>
                {replyTo.body}
              </Text>
            </View>
            <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={colors.muted} />
            </Pressable>
          </View>
        ) : null}
        <RoundGroupChatComposer
          styles={composerStyles}
          sendBusy={false}
          onSend={handleSend}
          onTyping={publishTyping}
        />
      </View>
    </View>
  );
}

const cStyles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 12,
  },
  loaderWrap: {
    paddingVertical: 16,
    alignItems: "center",
  },
  emptyFlex: {
    flex: 1,
    justifyContent: "center",
  },
  emptyText: {
    color: colors.muted,
    fontSize: 13,
    paddingVertical: 8,
    textAlign: "center",
  },
  listContent: {
    gap: 10,
    paddingTop: GROUP_CHAT_COMPOSER_GAP,
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
  },
  composerRow: {
    flexDirection: "row",
    gap: GROUP_CHAT_COMPOSER_GAP,
    alignItems: "flex-end",
    marginTop: GROUP_CHAT_COMPOSER_GAP,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: "#f1efea",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.fairway,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  replyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: colors.fairwaySoft,
    borderRadius: 8,
    marginBottom: 4,
  },
  replyBannerBar: {
    width: 3,
    height: "100%",
    minHeight: 24,
    backgroundColor: colors.fairway,
    borderRadius: 1.5,
  },
  replyBannerText: {
    flex: 1,
    gap: 1,
  },
  replyBannerName: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.fairway,
  },
  replyBannerBody: {
    fontSize: 12,
    color: colors.muted,
  },
});
