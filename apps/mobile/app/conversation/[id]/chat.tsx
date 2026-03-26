import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ScrollViewProps,
} from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ChatScrollView from "../../../components/chat-scroll-view";
import { ChatBubbleRow } from "../../../components/chat-bubble-row";
import { FullscreenImageViewer } from "../../../components/fullscreen-image-viewer";
import { ChatDateSeparator } from "../../../components/chat-date-separator";
import { ChatHeaderAvatars, ChatHeaderInfoButton } from "../../../components/chat-header-avatars";
import { ChatScrollToBottom } from "../../../components/chat-scroll-to-bottom";
import { ChatTimestamp } from "../../../components/chat-timestamp";
import { buildChatItems, chatItemKey, type ChatListItem } from "../../../lib/build-chat-items";
import { RoundGroupChatComposer, type ComposerHandle, type PickedImageAsset } from "../../../components/round-group-chat-composer";
import { TypingIndicator } from "../../../components/typing-indicator";
import { apiGet, apiPost, apiDelete } from "../../../lib/api";
import { imageAttachments } from "../../../lib/attachment-types";
import { uploadImage, POST_MAX_BYTES } from "../../../lib/upload-image";
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
import { useTypingPresence } from "../../../lib/use-typing-presence";

type ConversationMessage = CachedMessage;

type MessagesResponse = {
  messages: ConversationMessage[];
  hasMore: boolean;
  viewerId: string;
};

const POLL_MS = 5000;
const COMPOSER_AREA_HEIGHT = 60;

type ConversationMetaResponse = {
  type: string;
  title: string;
  imageUrl: string | null;
  roundMode: string | null;
  participantAvatars: string[];
};

type ConversationMeta = {
  type: string;
  title: string;
  participantAvatars: string[];
};

export default function ConversationChatScreen() {
  const {
    id: conversationId,
    chatTitle: paramTitle,
    chatAvatars: paramAvatarsJson,
    chatType: paramType,
  } = useLocalSearchParams<{
    id: string;
    chatTitle?: string;
    chatAvatars?: string;
    chatType?: string;
  }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const insets = useSafeAreaInsets();
  const { markConversationRead } = useChatUnread();

  const paramAvatars = useMemo<string[]>(() => {
    if (!paramAvatarsJson) return [];
    try { return JSON.parse(paramAvatarsJson); } catch { return []; }
  }, [paramAvatarsJson]);

  const [meta, setMeta] = useState<ConversationMeta | null>(() =>
    paramType && paramTitle
      ? { type: paramType, title: paramTitle, participantAvatars: paramAvatars }
      : null,
  );

  useEffect(() => {
    if (meta || !conversationId) return;
    void (async () => {
      try {
        const authToken = await getTokenRef.current();
        const data = await apiGet<ConversationMetaResponse>(
          `/api/conversations/${conversationId}`,
          authToken,
        );
        let avatars = data.participantAvatars;
        if (data.type === "group" && data.imageUrl) {
          avatars = [data.imageUrl];
        } else if (data.roundMode === "scheduled" && data.imageUrl) {
          avatars = [data.imageUrl, ...data.participantAvatars];
        }
        setMeta({
          type: data.type,
          title: data.title,
          participantAvatars: avatars.slice(0, 4),
        });
      } catch {
        /* header stays default */
      }
    })();
  }, [conversationId, meta]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <ChatHeaderAvatars
          type={meta?.type ?? "dm"}
          title={meta?.title ?? ""}
          avatars={meta?.participantAvatars ?? []}
        />
      ),
      headerRight: () => (
        <ChatHeaderInfoButton
          onPress={() =>
            router.push({
              pathname: "/chat-info",
              params: {
                conversationId: conversationId ?? "",
                chatType: meta?.type ?? "dm",
              },
            })
          }
        />
      ),
    });
  }, [navigation, meta, router, conversationId]);

  const [msgs, setMsgs] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(
    () => getCachedMeProfile()?.id ?? null,
  );
  const [replyTo, setReplyTo] = useState<ConversationMessage | null>(null);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const msgsRef = useRef<ConversationMessage[]>([]);
  msgsRef.current = msgs;
  const prevMsgCountRef = useRef(msgs.length);

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
      setHasMore(data.hasMore);
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

  const fetchOlderMessages = useCallback(async () => {
    if (!conversationId || !hasMore || loadingOlder) return;
    const oldest = msgsRef.current.length > 0
      ? [...msgsRef.current].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0]
      : null;
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const authToken = await getTokenRef.current();
      const data = await apiGet<MessagesResponse>(
        `/api/conversations/${conversationId}/messages?before=${oldest.id}`,
        authToken,
      );
      setHasMore(data.hasMore);
      setMsgs((prev) => {
        const merged = mergeMessages(prev, data.messages);
        void setCachedMessages(conversationId, merged);
        return merged;
      });
    } catch {
      /* silent — user can retry by scrolling again */
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, hasMore, loadingOlder]);

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
      const replyBody = replyTo?.body ?? "";
      const parentPreview = replyTo
        ? {
            body: replyBody.length > 80 ? replyBody.slice(0, 77) + "…" : replyBody,
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
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setMsgs((prev) => [...prev, optimistic]);

      try {
        const authToken = await getTokenRef.current();
        const data = await apiPost<{ message: ConversationMessage }>(
          `/api/conversations/${conversationId}/messages`,
          { body: trimmed, ...(parentId ? { parentId } : {}) },
          authToken,
        );
        setMsgs((prev) => {
          const optimisticMsg = prev.find((m) => m.id === tempId);
          const without = prev.filter((m) => m.id !== tempId);
          if (without.some((m) => m.id === data.message.id)) return without;
          const serverMsg = {
            ...data.message,
            parentPreview: data.message.parentPreview ?? optimisticMsg?.parentPreview ?? null,
          };
          const merged = [...without, serverMsg];
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

  const handleSendWithAttachments = useCallback(
    async (text: string, assets: PickedImageAsset[]): Promise<boolean> => {
      if (!conversationId || assets.length === 0) return false;

      const me = getCachedMeProfile();
      const tempId = `optimistic-img-${Date.now()}`;
      const body = text || null;

      const optimistic: ConversationMessage = {
        id: tempId,
        body,
        attachments: assets.map((a) => ({ type: "image" as const, url: a.uri })),
        createdAt: new Date().toISOString(),
        isMine: true,
        user: { id: me?.id ?? "", name: me?.name ?? "You", avatar: me?.avatar ?? null },
        reactions: {},
      };
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setMsgs((prev) => [...prev, optimistic]);

      try {
        const uploadedUrls = await Promise.all(
          assets.map((a) =>
            uploadImage({
              uri: a.uri,
              filename: `chat-image-${Date.now()}.jpg`,
              maxBytes: POST_MAX_BYTES,
              getToken: getTokenRef.current,
              width: a.width,
              height: a.height,
            }),
          ),
        );

        const authToken = await getTokenRef.current();
        const data = await apiPost<{ message: ConversationMessage }>(
          `/api/conversations/${conversationId}/messages`,
          {
            ...(body ? { body } : {}),
            attachments: imageAttachments(uploadedUrls),
          },
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
      } catch {
        setMsgs((prev) => prev.filter((m) => m.id !== tempId));
        setError("Could not send image.");
        return false;
      }
    },
    [conversationId],
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

  type ListItem = ChatListItem<ConversationMessage>;

  const invertedItems = useMemo(() => buildChatItems(msgs), [msgs]);

  const lastOwnMessageId = useMemo(() => {
    for (const item of invertedItems) {
      if (item.type === "message" && resolveMine(item.data)) {
        return item.data.id;
      }
    }
    return null;
  }, [invertedItems, resolveMine]);

  const handleReply = useCallback((msg: ConversationMessage) => {
    setReplyTo(msg);
  }, []);

  const handleImagePress = useCallback((images: string[], index: number) => {
    setViewerImages(images);
    setViewerIndex(index);
    setViewerVisible(true);
  }, []);

  const handleAvatarPress = useCallback((user: { id: string; name: string; avatar: string | null }) => {
    router.push({ pathname: "/profile/[userId]", params: { userId: user.id, userName: user.name, userAvatar: user.avatar ?? "" } });
  }, [router]);

  const handleGoToMessage = useCallback((messageId: string) => {
    const items = invertedItems;
    const idx = items.findIndex(
      (i) => i.type === "message" && i.data.id === messageId,
    );
    if (idx >= 0 && flatListRef.current) {
      flatListRef.current.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
      setTimeout(() => {
        setHighlightedId(messageId);
        setTimeout(() => setHighlightedId(null), 1500);
      }, 400);
    }
  }, [invertedItems]);

  const handleContextMenuClose = useCallback(() => {
    composerRef.current?.focus();
  }, []);

  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    setShowScrollBtn(e.nativeEvent.contentOffset.y > 300);
  }, []);

  const scrollToBottom = useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.type === "date") return <ChatDateSeparator date={item.date} />;
      if (item.type === "timestamp") return <ChatTimestamp date={item.date} />;
      return (
        <ChatBubbleRow
          message={item.data}
          isMine={resolveMine(item.data)}
          groupStyle={item.groupStyle}
          showStatus={item.data.id === lastOwnMessageId}
          highlighted={item.data.id === highlightedId}
          onImagePress={handleImagePress}
          userAvatarMap={userAvatarMap}
          conversationId={conversationId}
          viewerId={viewerId}
          onReaction={handleReaction}
          onReply={handleReply}
          onAvatarPress={handleAvatarPress}
          onGoToMessage={handleGoToMessage}
          onContextMenuClose={handleContextMenuClose}
        />
      );
    },
    [resolveMine, conversationId, viewerId, handleReaction, handleReply, handleAvatarPress, handleImagePress, lastOwnMessageId, highlightedId, handleGoToMessage, handleContextMenuClose],
  );
  const keyExtractor = useCallback(
    (item: ListItem) => chatItemKey(item),
    [],
  );

  const userAvatarMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const m of msgs) {
      if (m.user?.id && !(m.user.id in map)) {
        map[m.user.id] = m.user.avatar;
      }
    }
    return map;
  }, [msgs]);

  const composerStyles = useMemo(
    () => ({
      composerRow: cStyles.composerRow,
      input: cStyles.input,
      sendBtn: cStyles.sendBtn,
      sendBtnDisabled: cStyles.sendBtnDisabled,
    }),
    [],
  );

  const stickyOffset = useMemo(
    () => ({ opened: insets.bottom }),
    [insets.bottom],
  );

  const renderChatScroll = useCallback(
    (props: ScrollViewProps) => (
      <ChatScrollView {...props} inverted />
    ),
    [],
  );

  const ItemSeparator = useCallback(() => <View style={cStyles.separator} />, []);

  return (
    <>
    <View style={cStyles.root}>
      <View style={cStyles.listWrap}>
        <FlatList
          ref={flatListRef}
          data={invertedItems}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          inverted
          renderScrollComponent={renderChatScroll}
          contentContainerStyle={cStyles.listContent}
          ItemSeparatorComponent={ItemSeparator}
          keyboardShouldPersistTaps="always"
          onScroll={handleScroll}
          scrollEventThrottle={100}
          onEndReached={hasMore ? fetchOlderMessages : undefined}
          onEndReachedThreshold={0.3}
          onScrollToIndexFailed={() => {}}
          ListFooterComponent={
            loadingOlder ? (
              <View style={cStyles.paginationLoader}>
                <ActivityIndicator size="small" color={colors.muted} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            loading ? (
              <View style={cStyles.emptyInverted}>
                <ActivityIndicator size="small" color={colors.muted} />
              </View>
            ) : (
              <View style={cStyles.emptyInverted}>
                <Text style={cStyles.emptyText}>No messages yet. Say hi!</Text>
              </View>
            )
          }
        />
        <ChatScrollToBottom visible={showScrollBtn} onPress={scrollToBottom} />
      </View>

      {error ? <Text style={cStyles.errorText}>{error}</Text> : null}

      <KeyboardStickyView offset={stickyOffset}>
        <View style={[cStyles.composerWrap, { paddingBottom: insets.bottom + 8 }]}>
          <TypingIndicator names={typingNames} />
          <RoundGroupChatComposer
            ref={composerRef}
            styles={composerStyles}
            sendBusy={false}
            onSend={handleSend}
            onSendWithAttachments={handleSendWithAttachments}
            onTyping={publishTyping}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
          />
        </View>
      </KeyboardStickyView>
    </View>
    <FullscreenImageViewer
      images={viewerImages}
      initialIndex={viewerIndex}
      visible={viewerVisible}
      onClose={() => setViewerVisible(false)}
    />
    </>
  );
}

const cStyles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 16,
  },
  emptyInverted: {
    transform: [{ scaleY: -1 }],
    paddingVertical: 32,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 13,
    textAlign: "center",
  },
  listWrap: {
    flex: 1,
  },
  listContent: {
    paddingTop: COMPOSER_AREA_HEIGHT,
  },
  separator: {
    height: 6,
  },
  paginationLoader: {
    paddingVertical: 12,
    alignItems: "center",
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
  },
  composerWrap: {
    backgroundColor: "#fff",
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
});
