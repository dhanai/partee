import { useAuth } from "@clerk/clerk-expo";
import { ChatRoomProvider } from "@ably/chat/react";
import { ChatMessageEventType, type ChatMessageEvent } from "@ably/chat";
import { useMessages, useTyping, usePresence, usePresenceListener } from "@ably/chat/react";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  LayoutAnimation,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type ScrollViewProps,
} from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ChatScrollView, { ChatFreezeContext } from "../../../components/chat-scroll-view";
import { ChatBubbleRow } from "../../../components/chat-bubble-row";
import { ReportSheet } from "../../../components/report-sheet";
import { FullscreenImageViewer } from "../../../components/fullscreen-image-viewer";
import { ChatDateSeparator } from "../../../components/chat-date-separator";
import { ChatHeaderAvatars, ChatHeaderInfoButton } from "../../../components/chat-header-avatars";
import { ChatScrollToBottom } from "../../../components/chat-scroll-to-bottom";
import { ChatTimestamp } from "../../../components/chat-timestamp";
import { buildChatItems, chatItemKey, type ChatListItem } from "../../../lib/build-chat-items";
import { GiphyPickerSheet } from "../../../components/giphy-picker-sheet";
import { RoundGroupChatComposer, type ComposerHandle, type PickedImageAsset, type ReplyTarget } from "../../../components/round-group-chat-composer";
import { TypingIndicator } from "../../../components/typing-indicator";
import { apiGet, apiPost, apiPatch, apiDelete } from "../../../lib/api";
import { useAblyChatMounted } from "../../../lib/ably-chat-context";
import { ablyChatMessageToCached } from "../../../lib/ably-chat-message-map";
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
import { parfadeMutationMessageToCached, subscribeMessageMutations } from "../../../lib/message-mutation-events";
import { subscribeReactionUpdates } from "../../../lib/reaction-events";
import { subscribeReadReceiptUpdates } from "../../../lib/read-receipt-events";
import { colors } from "../../../lib/theme";

type ConversationMessage = CachedMessage;

type MessagesResponse = {
  messages: ConversationMessage[];
  hasMore: boolean;
  viewerId: string;
};

const MARGIN = 8;

const ROOM_OPTIONS = {
  typing: { heartbeatThrottleMs: 5000 },
  presence: {},
} as const;

type ConversationMetaResponse = {
  type: string;
  title: string;
  imageUrl: string | null;
  roundMode: string | null;
  participantAvatars: string[];
  participants?: { id: string; name: string; avatar: string | null }[];
  participantReadReceipts?: {
    userId: string;
    avatar: string | null;
    lastReadMessageId: string | null;
    lastReadMessageCreatedAt: string | null;
  }[];
};

type PeerRead = {
  lastReadMessageId: string | null;
  lastReadMessageCreatedAt: string | null;
  avatar: string | null;
};

const MAX_MESSAGE_BODY = 2000;

type ConversationMeta = {
  type: string;
  title: string;
  participantAvatars: string[];
  avatarUserIds: (string | null)[];
  participants: { id: string; name: string; avatar: string | null }[];
};

export default function ConversationChatScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const ablyMounted = useAblyChatMounted();

  if (ablyMounted && conversationId) {
    return (
      <ChatRoomProvider name={conversationId} options={ROOM_OPTIONS}>
        <ConversationChatContent />
      </ChatRoomProvider>
    );
  }

  return <ConversationChatContent />;
}

function ConversationChatContent() {
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
      ? { type: paramType, title: paramTitle, participantAvatars: paramAvatars, avatarUserIds: [], participants: [] }
      : null,
  );

  const metaFetchedRef = useRef(false);
  useEffect(() => {
    if (metaFetchedRef.current || !conversationId) return;
    metaFetchedRef.current = true;
    void (async () => {
      try {
        const authToken = await getTokenRef.current();
        const data = await apiGet<ConversationMetaResponse>(
          `/api/conversations/${conversationId}`,
          authToken,
        );
        const rawAvatars = data.participantAvatars ?? [];
        let avatars = rawAvatars.filter((a): a is string => Boolean(a));
        const allParticipants = data.participants ?? [];
        const avatarToUserId = new Map(
          allParticipants
            .filter((p) => p.avatar)
            .map((p) => [p.avatar!, p.id]),
        );
        // `participantAvatars` from the API is only *other* members (viewer excluded). Do not index
        // into `allParticipants` — that array includes the viewer, so [0] can pair someone else's
        // photo with the viewer's id and the header online dot shows true whenever *you* are online.
        let userIds: (string | null)[] = rawAvatars.map((a) => {
          if (!a) return null;
          return avatarToUserId.get(a) ?? null;
        });

        if (data.type === "group" && data.imageUrl) {
          avatars = [data.imageUrl];
          userIds = [null];
        } else if (data.roundMode === "scheduled" && data.imageUrl) {
          const userSlotIds = rawAvatars.map((a) => {
            if (!a) return null;
            return avatarToUserId.get(a) ?? null;
          });
          avatars = [data.imageUrl, ...avatars];
          userIds = [null, ...userSlotIds];
        }
        const peerRead: Record<string, PeerRead> = {};
        for (const r of data.participantReadReceipts ?? []) {
          peerRead[r.userId] = {
            lastReadMessageId: r.lastReadMessageId,
            lastReadMessageCreatedAt: r.lastReadMessageCreatedAt,
            avatar: r.avatar ?? null,
          };
        }
        setPeerReadByUserId(peerRead);

        setMeta({
          type: data.type,
          title: data.title,
          participantAvatars: avatars.slice(0, 4),
          avatarUserIds: userIds.slice(0, 4),
          participants: allParticipants.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar ?? null })),
        });
      } catch {
        /* header stays default */
      }
    })();
  }, [conversationId]);

  const metaLoading = !meta;

  const [msgs, setMsgs] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(
    () => getCachedMeProfile()?.id ?? null,
  );
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{ id: string; userId: string } | null>(null);
  const [peerReadByUserId, setPeerReadByUserId] = useState<Record<string, PeerRead>>({});
  const [editingMessage, setEditingMessage] = useState<ConversationMessage | null>(null);
  const [gifSheetVisible, setGifSheetVisible] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (editingMessage) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [editingMessage]);
  const composerRef = useRef<ComposerHandle>(null);
  const msgsRef = useRef<ConversationMessage[]>([]);
  msgsRef.current = msgs;
  const viewerIdRef = useRef<string | null>(null);
  viewerIdRef.current = viewerId;
  const prevMsgCountRef = useRef(msgs.length);

  const me = getCachedMeProfile();
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const publishTypingRef = useRef<() => void>(() => {});
  const stopTypingRef = useRef<() => void>(() => {});
  const publishTyping = useCallback(() => publishTypingRef.current(), []);
  const stopTyping = useCallback(() => stopTypingRef.current(), []);

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
        const merged = mergeMessages(prev, data.messages ?? []);
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
        const merged = mergeMessages(prev, data.messages ?? []);
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

  const ablyMounted = useAblyChatMounted();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <ChatHeaderAvatars
          type={meta?.type ?? "dm"}
          title={meta?.title ?? ""}
          avatars={meta?.participantAvatars ?? []}
          loading={metaLoading}
          avatarUserIds={meta?.avatarUserIds}
          onlineUserIds={onlineUserIds}
        />
      ),
      headerRight: () =>
        metaLoading ? null : (
          <ChatHeaderInfoButton
            onPress={() =>
              router.push({
                pathname: "/chat-info",
                params: {
                  conversationId: conversationId ?? "",
                  chatType: meta?.type ?? "dm",
                  onlineIds: JSON.stringify([...onlineUserIds]),
                },
              })
            }
          />
        ),
    });
  }, [navigation, meta, metaLoading, router, conversationId, onlineUserIds]);

  const handleAblyMessage = useCallback(
    (event: ChatMessageEvent) => {
      if (event.type !== ChatMessageEventType.Created) return;
      const incoming = ablyChatMessageToCached(event.message, viewerId);
      if (incoming.isMine) return;
      setMsgs((prev) => {
        if (prev.some((m) => m.id === incoming.id)) return prev;
        const merged = [...prev, incoming].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        void setCachedMessages(conversationId!, merged);
        return merged;
      });
    },
    [conversationId, viewerId],
  );

  useEffect(() => {
    if (!conversationId) return;
    markConversationRead(conversationId);
    return () => {
      markConversationRead(conversationId);
    };
  }, [conversationId, markConversationRead]);

  useEffect(() => {
    if (!conversationId) return;
    return () => {
      const sorted = [...msgsRef.current].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      const last = sorted[sorted.length - 1];
      if (!last?.id || last.id.startsWith("optimistic")) return;
      void (async () => {
        try {
          const authToken = await getTokenRef.current();
          await apiPost(
            `/api/conversations/${conversationId}/read`,
            { lastMessageId: last.id },
            authToken,
          );
        } catch {
          /* best-effort */
        }
      })();
    };
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    const sorted = [...msgs].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const last = sorted[sorted.length - 1];
    if (!last?.id || last.id.startsWith("optimistic")) return;
    const t = setTimeout(() => {
      void (async () => {
        try {
          const authToken = await getTokenRef.current();
          await apiPost(
            `/api/conversations/${conversationId}/read`,
            { lastMessageId: last.id },
            authToken,
          );
        } catch {
          /* best-effort */
        }
      })();
    }, 400);
    return () => clearTimeout(t);
  }, [conversationId, msgs]);

  const handleSend = useCallback(
    async (text: string): Promise<boolean> => {
      const trimmed = text.trim();
      if (!trimmed || !conversationId) return false;

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

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
      stopTyping();

      const optimistic: ConversationMessage = {
        id: tempId,
        body: trimmed,
        createdAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
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
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      stopTyping();

      const me = getCachedMeProfile();
      const tempId = `optimistic-img-${Date.now()}`;
      const body = text || null;

      const optimistic: ConversationMessage = {
        id: tempId,
        body,
        attachments: assets.map((a) => ({ type: "image" as const, url: a.uri })),
        createdAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
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
          if (prev.some((m) => m.id === data.message.id)) {
            return prev.filter((m) => m.id !== tempId);
          }
          const optimisticMsg = prev.find((m) => m.id === tempId);
          const updated = prev.map((m) =>
            m.id === tempId
              ? { ...data.message, attachments: optimisticMsg?.attachments ?? data.message.attachments }
              : m,
          );
          void setCachedMessages(
            conversationId,
            updated.map((m) => (m.id === tempId ? data.message : m)),
          );
          return updated;
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

  const handleSendGif = useCallback(
    async (item: { sendUrl: string; id: string }) => {
      if (!conversationId) return;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      stopTyping();

      const me = getCachedMeProfile();
      const tempId = `optimistic-gif-${Date.now()}`;
      const att = { type: "gif" as const, url: item.sendUrl, giphyId: item.id };

      const optimistic: ConversationMessage = {
        id: tempId,
        body: null,
        attachments: [att],
        createdAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
        isMine: true,
        user: { id: me?.id ?? "", name: me?.name ?? "You", avatar: me?.avatar ?? null },
        reactions: {},
      };
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setMsgs((prev) => [...prev, optimistic]);

      try {
        const authToken = await getTokenRef.current();
        const data = await apiPost<{ message: ConversationMessage }>(
          `/api/conversations/${conversationId}/messages`,
          { attachments: [att] },
          authToken,
        );
        setMsgs((prev) => {
          if (prev.some((m) => m.id === data.message.id)) {
            return prev.filter((m) => m.id !== tempId);
          }
          const optimisticMsg = prev.find((m) => m.id === tempId);
          const updated = prev.map((m) =>
            m.id === tempId
              ? { ...data.message, attachments: optimisticMsg?.attachments ?? data.message.attachments }
              : m,
          );
          void setCachedMessages(
            conversationId,
            updated.map((m) => (m.id === tempId ? data.message : m)),
          );
          return updated;
        });
      } catch {
        setMsgs((prev) => prev.filter((m) => m.id !== tempId));
        setError("Could not send GIF.");
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

  useEffect(() => {
    if (!conversationId) return;
    return subscribeReactionUpdates((update) => {
      if (update.conversationId !== conversationId) return;
      setMsgs((prev) =>
        prev.map((m) => {
          if (m.id !== update.messageId) return m;
          const reactions = { ...m.reactions };
          const existing = reactions[update.emoji] ?? { count: 0, userIds: [] };
          if (update.action === "add") {
            if (!existing.userIds.includes(update.userId)) {
              reactions[update.emoji] = {
                count: existing.count + 1,
                userIds: [...existing.userIds, update.userId],
              };
            }
          } else {
            reactions[update.emoji] = {
              count: Math.max(0, existing.count - 1),
              userIds: existing.userIds.filter((id) => id !== update.userId),
            };
            if (reactions[update.emoji]!.count === 0) delete reactions[update.emoji];
          }
          return { ...m, reactions };
        }),
      );
    });
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    return subscribeMessageMutations((u) => {
      if (u.conversationId !== conversationId) return;
      const merged = parfadeMutationMessageToCached(u.message, viewerIdRef.current);
      setMsgs((prev) => {
        const idx = prev.findIndex((m) => m.id === merged.id);
        if (idx < 0) return prev;
        const next = [...prev];
        next[idx] = merged;
        void setCachedMessages(conversationId, next);
        return next;
      });
    });
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId || !viewerId) return;
    return subscribeReadReceiptUpdates((u) => {
      if (u.conversationId !== conversationId || u.readerUserId === viewerId) return;
      const readMsg = msgsRef.current.find((m) => m.id === u.lastReadMessageId);
      const createdAtFromEvent = u.lastReadMessageCreatedAt?.trim() || null;
      setPeerReadByUserId((prev) => ({
        ...prev,
        [u.readerUserId]: {
          lastReadMessageId: u.lastReadMessageId,
          lastReadMessageCreatedAt:
            readMsg?.createdAt ??
            createdAtFromEvent ??
            prev[u.readerUserId]?.lastReadMessageCreatedAt ??
            null,
          avatar: u.readerAvatar ?? prev[u.readerUserId]?.avatar ?? null,
        },
      }));
    });
  }, [conversationId, viewerId]);

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

  const messageOrderMeta = useMemo(() => {
    const chron = [...msgs].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const indexById = new Map<string, number>();
    chron.forEach((msg, i) => indexById.set(msg.id, i));
    return { indexById };
  }, [msgs]);

  const readReceiptPeersForLastOwn = useMemo(() => {
    if (!lastOwnMessageId || !viewerId) return [];
    const ownIdx = messageOrderMeta.indexById.get(lastOwnMessageId);
    const ownMsg = msgs.find((m) => m.id === lastOwnMessageId);
    if (ownIdx === undefined || !ownMsg || !resolveMine(ownMsg)) return [];
    const ownT = new Date(ownMsg.createdAt).getTime();
    const out: { userId: string; avatar: string | null }[] = [];
    for (const [uid, r] of Object.entries(peerReadByUserId)) {
      if (uid === viewerId) continue;
      if (!r.lastReadMessageId) continue;
      const readIdx = messageOrderMeta.indexById.get(r.lastReadMessageId);
      let hasRead = false;
      if (readIdx !== undefined) {
        hasRead = readIdx >= ownIdx;
      } else if (r.lastReadMessageCreatedAt) {
        hasRead = new Date(r.lastReadMessageCreatedAt).getTime() >= ownT;
      }
      if (hasRead) {
        out.push({ userId: uid, avatar: r.avatar });
      }
    }
    return out;
  }, [lastOwnMessageId, viewerId, msgs, peerReadByUserId, messageOrderMeta, resolveMine]);

  const handleUnsend = useCallback(
    async (messageId: string) => {
      if (!conversationId) return;
      const prevSnapshot = msgsRef.current;
      const nowIso = new Date().toISOString();
      const optimistic = prevSnapshot.map((m) =>
        m.id === messageId ? { ...m, body: null, attachments: null, deletedAt: nowIso } : m,
      );
      setMsgs(optimistic);
      try {
        const authToken = await getTokenRef.current();
        await apiDelete(`/api/conversations/${conversationId}/messages/${messageId}`, authToken);
        void setCachedMessages(conversationId, optimistic);
      } catch {
        setMsgs(prevSnapshot);
        void setCachedMessages(conversationId, prevSnapshot);
        setError("Could not unsend message.");
      }
    },
    [conversationId],
  );

  const handleStartEdit = useCallback((msg: ConversationMessage) => {
    setEditingMessage(msg);
    setEditDraft(msg.body ?? "");
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!conversationId || !editingMessage) return;
    const body = editDraft.trim();
    if (!body) return;
    try {
      const authToken = await getTokenRef.current();
      const data = await apiPatch<{ message: ConversationMessage }>(
        `/api/conversations/${conversationId}/messages/${editingMessage.id}`,
        { body },
        authToken,
      );
      setMsgs((prev) => {
        const next = prev.map((m) => (m.id === editingMessage.id ? { ...m, ...data.message } : m));
        void setCachedMessages(conversationId, next);
        return next;
      });
      setEditingMessage(null);
      setEditDraft("");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not edit message.");
    }
  }, [conversationId, editingMessage, editDraft]);

  const handleReply = useCallback((msg: { id: string; body: string | null; user: { name: string } }) => {
    setReplyTo({ id: msg.id, body: msg.body ?? "", user: { name: msg.user.name } });
  }, []);

  const handleReport = useCallback((msg: { id: string; user: { id: string } }) => {
    if (msg.user.id === "deleted") return;
    setReportTarget({ id: msg.id, userId: msg.user.id });
  }, []);

  const handleImagePress = useCallback((images: string[], index: number) => {
    setViewerImages(images);
    setViewerIndex(index);
    setViewerVisible(true);
  }, []);

  const handleAvatarPress = useCallback((user: { id: string; name: string; avatar: string | null }) => {
    if (user.id === "deleted") return;
    router.push({
      pathname: "/profile/[userId]",
      params: {
        userId: user.id,
        userName: user.name,
        userAvatar: user.avatar ?? "",
      },
    });
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

  const [chatFreeze, setChatFreeze] = useState(false);
  const kbVisible = useRef(false);
  const kbWasOpen = useRef(false);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardWillShow", () => { kbVisible.current = true; });
    const hideSub = Keyboard.addListener("keyboardWillHide", () => { kbVisible.current = false; });
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const handleContextMenuOpen = useCallback(() => {
    kbWasOpen.current = kbVisible.current;
    setChatFreeze(true);
  }, []);

  const handleContextMenuClose = useCallback(() => {
    setChatFreeze(false);
    if (kbWasOpen.current) {
      composerRef.current?.focus();
    }
  }, []);

  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    setShowScrollBtn(e.nativeEvent.contentOffset.y > 300);
  }, []);

  const scrollToBottom = useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const userInfoMap = useMemo(() => {
    const map: Record<string, { name: string; avatar: string | null }> = {};
    if (meta?.participants) {
      for (const p of meta.participants) {
        map[p.id] = { name: p.name, avatar: p.avatar ?? null };
      }
    }
    for (const m of msgs) {
      if (m.user?.id) {
        map[m.user.id] = {
          name: m.user.name,
          avatar: m.user.avatar,
        };
      }
    }
    return map;
  }, [msgs, meta?.participants]);

  const userAvatarMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const [id, info] of Object.entries(userInfoMap)) {
      map[id] = info.avatar;
    }
    return map;
  }, [userInfoMap]);

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
          readReceiptPeers={
            item.data.id === lastOwnMessageId ? readReceiptPeersForLastOwn : undefined
          }
          onImagePress={handleImagePress}
          userAvatarMap={userAvatarMap}
          userInfoMap={userInfoMap}
          conversationId={conversationId}
          viewerId={viewerId}
          onReaction={handleReaction}
          onReply={handleReply}
          onEdit={handleStartEdit}
          onDelete={handleUnsend}
          onReport={handleReport}
          onAvatarPress={handleAvatarPress}
          onGoToMessage={handleGoToMessage}
          onContextMenuOpen={handleContextMenuOpen}
          onContextMenuClose={handleContextMenuClose}
          onlineUserIds={onlineUserIds}
        />
      );
    },
    [
      resolveMine,
      conversationId,
      viewerId,
      handleReaction,
      handleReply,
      handleStartEdit,
      handleUnsend,
      handleReport,
      handleAvatarPress,
      handleImagePress,
      lastOwnMessageId,
      readReceiptPeersForLastOwn,
      highlightedId,
      handleGoToMessage,
      handleContextMenuOpen,
      handleContextMenuClose,
      userAvatarMap,
      userInfoMap,
      onlineUserIds,
    ],
  );
  const keyExtractor = useCallback(
    (item: ListItem) => chatItemKey(item),
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

  const stickyOffset = useMemo(
    () => ({ opened: insets.bottom - 8 }),
    [insets.bottom],
  );

  const extraContentPadding = useSharedValue(0);
  const composerBaseHeight = useRef(0);

  const onComposerLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const h = e.nativeEvent.layout.height;
      if (composerBaseHeight.current === 0) {
        composerBaseHeight.current = h;
        return;
      }
      extraContentPadding.value = withTiming(
        Math.max(h - composerBaseHeight.current, 0),
        { duration: 250 },
      );
    },
    [extraContentPadding],
  );

  const renderChatScroll = useCallback(
    (props: ScrollViewProps) => (
      <ChatScrollView {...props} inverted extraContentPadding={extraContentPadding} />
    ),
    [extraContentPadding],
  );

  const ItemSeparator = useCallback(() => <View style={cStyles.separator} />, []);

  return (
    <>
    {ablyMounted ? (
      <>
        <AblyChatSubscription onMessage={handleAblyMessage} />
        <AblyChatTyping
          viewerId={viewerId}
          userInfoMap={userInfoMap}
          onTypersChanged={setTypingNames}
          onKeystrokeReady={(fn) => { publishTypingRef.current = fn; }}
          onStopReady={(fn) => { stopTypingRef.current = fn; }}
        />
        <AblyChatPresence name={me?.name ?? "User"} />
        <AblyChatPresenceListener
          viewerId={viewerId}
          onOnlineIdsChanged={setOnlineUserIds}
        />
      </>
    ) : null}
    <ChatFreezeContext.Provider value={chatFreeze}>
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
        <View style={[cStyles.composerWrap, { paddingBottom: insets.bottom + 8 }]} onLayout={onComposerLayout}>
          <TypingIndicator names={typingNames} />
          <RoundGroupChatComposer
            ref={composerRef}
            styles={composerStyles}
            sendBusy={false}
            onSend={handleSend}
            onSendWithAttachments={handleSendWithAttachments}
            onGifPress={() => setGifSheetVisible(true)}
            onTyping={publishTyping}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
          />
        </View>
      </KeyboardStickyView>
    </View>
    </ChatFreezeContext.Provider>
    <FullscreenImageViewer
      images={viewerImages}
      initialIndex={viewerIndex}
      visible={viewerVisible}
      onClose={() => setViewerVisible(false)}
    />
    <GiphyPickerSheet
      visible={gifSheetVisible}
      onClose={() => setGifSheetVisible(false)}
      onSelect={async (item) => {
        setGifSheetVisible(false);
        await handleSendGif(item);
      }}
    />
    <ReportSheet
      visible={!!reportTarget}
      onClose={() => setReportTarget(null)}
      contentType="message"
      contentId={reportTarget?.id ?? ""}
      targetUserId={reportTarget?.userId}
      targetLabel="this message"
    />

    <Modal
      visible={!!editingMessage}
      transparent
      animationType="fade"
      onRequestClose={() => {
        setEditingMessage(null);
        setEditDraft("");
      }}
    >
      <Pressable
        style={cStyles.editModalBackdrop}
        onPress={() => {
          setEditingMessage(null);
          setEditDraft("");
        }}
      >
        <Pressable style={cStyles.editModalCard} onPress={(e) => e.stopPropagation()}>
          <Text style={cStyles.editModalTitle}>Edit message</Text>
          <TextInput
            value={editDraft}
            onChangeText={setEditDraft}
            style={cStyles.editModalInput}
            multiline
            maxLength={MAX_MESSAGE_BODY}
            autoFocus
          />
          <View style={cStyles.editModalActions}>
            <Pressable
              onPress={() => {
                setEditingMessage(null);
                setEditDraft("");
              }}
              style={cStyles.editModalBtnSecondary}
            >
              <Text style={cStyles.editModalBtnSecondaryText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleSaveEdit()}
              style={[
                cStyles.editModalBtnPrimary,
                !editDraft.trim() ? cStyles.editModalBtnPrimaryDisabled : null,
              ]}
              disabled={!editDraft.trim()}
            >
              <Text style={cStyles.editModalBtnPrimaryText}>Save</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
    </>
  );
}

function AblyChatPresence({ name }: { name: string }) {
  usePresence({ initialData: { name } });
  return null;
}

function AblyChatPresenceListener({
  viewerId,
  onOnlineIdsChanged,
}: {
  viewerId: string | null;
  onOnlineIdsChanged: (ids: Set<string>) => void;
}) {
  const { presenceData } = usePresenceListener();

  useEffect(() => {
    const ids = new Set(presenceData.map((m) => m.clientId));
    if (viewerId) ids.add(viewerId);
    onOnlineIdsChanged(ids);
  }, [presenceData, viewerId, onOnlineIdsChanged]);

  return null;
}

function AblyChatSubscription({
  onMessage,
}: {
  onMessage: (event: ChatMessageEvent) => void;
}) {
  useMessages({ listener: onMessage });
  return null;
}

function AblyChatTyping({
  viewerId,
  userInfoMap,
  onTypersChanged,
  onKeystrokeReady,
  onStopReady,
}: {
  viewerId: string | null;
  userInfoMap: Record<string, { name: string; avatar: string | null }>;
  onTypersChanged: (names: string[]) => void;
  onKeystrokeReady: (fn: () => void) => void;
  onStopReady: (fn: () => void) => void;
}) {
  const { keystroke, stop, currentlyTyping } = useTyping({
    listener: () => {},
  });

  useEffect(() => {
    onKeystrokeReady(() => { void keystroke().catch(() => {}); });
    onStopReady(() => { void stop().catch(() => {}); });
  }, [keystroke, stop, onKeystrokeReady, onStopReady]);

  useEffect(() => {
    const names: string[] = [];
    currentlyTyping.forEach((clientId) => {
      if (clientId === viewerId) return;
      const info = userInfoMap[clientId];
      names.push(info?.name ?? clientId.slice(0, 8));
    });
    onTypersChanged(names);
  }, [currentlyTyping, viewerId, userInfoMap, onTypersChanged]);

  return null;
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
    paddingTop: MARGIN,
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
  composerWrap: {},
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
  editModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  editModalCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  editModalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
  },
  editModalInput: {
    minHeight: 100,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    textAlignVertical: "top",
  },
  editModalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 4,
  },
  editModalBtnSecondary: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  editModalBtnSecondaryText: {
    fontSize: 16,
    color: colors.muted,
    fontWeight: "600",
  },
  editModalBtnPrimary: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: colors.fairway,
    borderRadius: 12,
  },
  editModalBtnPrimaryDisabled: {
    opacity: 0.45,
  },
  editModalBtnPrimaryText: {
    fontSize: 16,
    color: "#fff",
    fontWeight: "700",
  },
});
