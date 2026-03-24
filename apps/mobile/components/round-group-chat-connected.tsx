import { ChatMessageEventType, ConnectionStatus } from "@ably/chat";
import { useChatConnection, useMessages } from "@ably/chat/react";
import type { Message } from "ably";
import { useAbly } from "ably/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet, apiPost } from "../lib/api";
import { parfadeRoundDetailChannel } from "../lib/parfade-ably-channels";
import { parseParfadeRealtimeMessage } from "../lib/parfade-ably-messages";
import { getCachedMeProfile } from "../lib/me-profile-cache";
import { useFullscreenChatKeyboard } from "../lib/use-group-chat-layout";
import { colors } from "../lib/theme";
import { ChatBubbleRow } from "./chat-bubble-row";
import { RoundGroupChatComposer } from "./round-group-chat-composer";
import { RoundDetailSection } from "./round-detail-section";
import {
  type ChatMessage,
  type RoundGroupChatProps,
  roundGroupChatStyles as styles,
} from "./round-group-chat-poll";

type MessagesResponse = { messages: ChatMessage[]; viewerId?: string };

const POLL_MS = 4200;
const POLL_BACKUP_WHEN_ABLY_MS = 5000;
const REALTIME_PULL_DEBOUNCE_MS = 450;
const MAX_LIST_HEIGHT = 240;
const PARFADE_EVENT = "parfade";

function sortMessagesByTime(list: ChatMessage[]): ChatMessage[] {
  return [...list].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

function headerStr(
  headers: Record<string, string | number | boolean | null | undefined> | undefined,
  key: string,
): string | null {
  if (!headers) return null;
  const v = headers[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function RoundGroupChatConnected({
  inviteToken,
  getToken,
  onComposerFocus,
  variant = "inline",
}: RoundGroupChatProps) {
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(true);
  const isFullscreen = variant === "fullscreen";
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendBusy, setSendBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const inviteTokenRef = useRef(inviteToken);
  inviteTokenRef.current = inviteToken;
  const [viewerId, setViewerId] = useState<string | null>(() => getCachedMeProfile()?.id ?? null);
  const viewerIdRef = useRef<string | null>(viewerId);
  viewerIdRef.current = viewerId;
  const loadGenRef = useRef(0);
  const prevMessageCountRef = useRef(0);
  const realtimePullDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ably = useAbly();

  const { keyboardPadding, composerBottomPadding } = useFullscreenChatKeyboard(insets.bottom);

  const { currentStatus } = useChatConnection();
  const ablyConnected = currentStatus === ConnectionStatus.Connected;

  const { sendMessage } = useMessages({
    listener: (event) => {
      if (event.type !== ChatMessageEventType.Created) return;
      const msg = event.message;
      const id = headerStr(msg.headers, "x-msg-id");
      if (!id) return;
      const name = headerStr(msg.headers, "x-user-name") ?? "Someone";
      const avatarRaw = headerStr(msg.headers, "x-user-avatar");
      const avatar = avatarRaw ?? null;
      const uid = msg.clientId?.trim() ?? "";
      const vid = viewerIdRef.current?.trim();
      const chatMsg: ChatMessage = {
        id,
        body: msg.text,
        createdAt:
          msg.timestamp instanceof Date
            ? msg.timestamp.toISOString()
            : new Date(msg.timestamp as unknown as string | number).toISOString(),
        isMine: vid != null && vid.length > 0 && uid === vid,
        user: { id: uid, name, avatar },
      };
      setMessages((prev) => {
        if (prev.some((m) => m.id === chatMsg.id)) return prev;
        return sortMessagesByTime([...prev, chatMsg]);
      });
    },
  });

  function resolveMine(m: ChatMessage): boolean {
    if (typeof m.isMine === "boolean") return m.isMine;
    const vid = viewerId?.trim();
    return vid != null && vid.length > 0 && m.user.id.trim() === vid;
  }

  const fetchInitial = useCallback(async () => {
    const gen = ++loadGenRef.current;
    try {
      const authToken = await getTokenRef.current();
      if (!authToken) return;
      const data = await apiGet<MessagesResponse>(
        `/api/rounds/${inviteToken}/messages`,
        authToken,
      );
      if (loadGenRef.current !== gen) return;
      setViewerId((prev) => {
        const fromApi = data.viewerId?.trim();
        const fromCache = getCachedMeProfile()?.id?.trim();
        return fromApi || fromCache || prev || null;
      });
      setMessages(data.messages ?? []);
      setLoadError(null);
    } catch (e) {
      if (loadGenRef.current === gen) {
        setLoadError(e instanceof Error ? e.message : "Could not load chat.");
      }
    } finally {
      if (loadGenRef.current === gen) {
        setLoading(false);
      }
    }
  }, [inviteToken]);

  const pullNewMessagesFromApi = useCallback(async () => {
    const pollToken = inviteTokenRef.current;
    try {
      const authToken = await getTokenRef.current();
      if (!authToken) return;
      const list = messagesRef.current;
      if (inviteTokenRef.current !== pollToken) return;
      if (list.length === 0) {
        const data = await apiGet<MessagesResponse>(
          `/api/rounds/${pollToken}/messages`,
          authToken,
        );
        if (inviteTokenRef.current !== pollToken) return;
        setViewerId((prev) => {
          const v = data.viewerId?.trim() || getCachedMeProfile()?.id?.trim();
          const next = v || prev || null;
          return next === prev ? prev : next;
        });
        const incoming = data.messages ?? [];
        if (incoming.length > 0) {
          setMessages((prev) => (prev.length > 0 ? prev : sortMessagesByTime(incoming)));
        }
        return;
      }
      const last = list[list.length - 1];
      const data = await apiGet<MessagesResponse>(
        `/api/rounds/${pollToken}/messages?after=${encodeURIComponent(last.id)}`,
        authToken,
      );
      if (inviteTokenRef.current !== pollToken) return;
      setViewerId((prev) => {
        const v = data.viewerId?.trim() || getCachedMeProfile()?.id?.trim();
        const next = v || prev || null;
        return next === prev ? prev : next;
      });
      const incoming = data.messages ?? [];
      if (incoming.length === 0) return;
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        let added = 0;
        const merged = [...prev];
        for (const m of incoming) {
          if (!seen.has(m.id)) {
            seen.add(m.id);
            merged.push(m);
            added += 1;
          }
        }
        return added === 0 ? prev : sortMessagesByTime(merged);
      });
    } catch {
      /* ignore */
    }
  }, []);

  const schedulePullFromRoundDetailFanout = useCallback(() => {
    if (realtimePullDebounceRef.current != null) {
      clearTimeout(realtimePullDebounceRef.current);
    }
    realtimePullDebounceRef.current = setTimeout(() => {
      realtimePullDebounceRef.current = null;
      void pullNewMessagesFromApi();
    }, REALTIME_PULL_DEBOUNCE_MS);
  }, [pullNewMessagesFromApi]);

  useEffect(() => {
    const t = inviteToken.trim();
    if (!t) return;
    const channel = ably.channels.get(parfadeRoundDetailChannel(t));
    const handler = (message: Message) => {
      const parsed = parseParfadeRealtimeMessage(message.data);
      if (parsed?.type !== "round-detail-updated" || parsed.inviteToken !== t) return;
      if (parsed.reason === "chat-message") {
        void pullNewMessagesFromApi();
        return;
      }
      schedulePullFromRoundDetailFanout();
    };
    void channel.subscribe(PARFADE_EVENT, handler);
    return () => {
      if (realtimePullDebounceRef.current != null) {
        clearTimeout(realtimePullDebounceRef.current);
        realtimePullDebounceRef.current = null;
      }
      void channel.unsubscribe(PARFADE_EVENT, handler);
    };
  }, [ably, inviteToken, pullNewMessagesFromApi, schedulePullFromRoundDetailFanout]);

  useEffect(() => {
    setMessages([]);
    setLoadError(null);
    setLoading(true);
    void fetchInitial();
  }, [fetchInitial]);

  const pollActive = isFullscreen || expanded;

  useEffect(() => {
    if (!pollActive) return;
    const ms = ablyConnected ? POLL_BACKUP_WHEN_ABLY_MS : POLL_MS;
    const id = setInterval(() => {
      void pullNewMessagesFromApi();
    }, ms);
    return () => clearInterval(id);
  }, [pollActive, ablyConnected, pullNewMessagesFromApi]);

  // Inline variant only: scroll to end when new messages arrive
  useEffect(() => {
    if (isFullscreen || !pollActive) return;
    if (messages.length === 0) {
      prevMessageCountRef.current = 0;
      return;
    }
    const prev = prevMessageCountRef.current;
    const next = messages.length;
    const delta = next - prev;
    const t = requestAnimationFrame(() => {
      if (next > prev) {
        scrollRef.current?.scrollToEnd({ animated: delta <= 4 });
      }
    });
    prevMessageCountRef.current = next;
    return () => cancelAnimationFrame(t);
  }, [messages.length, pollActive, isFullscreen]);

  const handleSend = useCallback(
    async (text: string): Promise<boolean> => {
      const trimmed = text.trim();
      if (!trimmed) return false;
      setLoadError(null);

      const me = getCachedMeProfile();
      const tempId = `optimistic-${Date.now()}`;
      const optimistic: ChatMessage = {
        id: tempId,
        body: trimmed,
        createdAt: new Date().toISOString(),
        isMine: true,
        user: {
          id: me?.id ?? "",
          name: me?.name ?? "You",
          avatar: me?.avatar ?? null,
        },
      };
      setMessages((prev) => [...prev, optimistic]);

      try {
        const authToken = await getTokenRef.current();
        if (!authToken) {
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          setLoadError("Sign in to send a message.");
          return false;
        }
        const data = await apiPost<MessagesResponse & { message: ChatMessage }>(
          `/api/rounds/${inviteToken}/messages`,
          { body: trimmed },
          authToken,
        );
        const vidSend = data.viewerId?.trim() || getCachedMeProfile()?.id?.trim();
        if (vidSend) setViewerId(vidSend);
        setMessages((prev) => {
          const without = prev.filter((m) => m.id !== tempId);
          if (without.some((m) => m.id === data.message.id)) return without;
          return sortMessagesByTime([...without, data.message]);
        });

        if (ablyConnected) {
          try {
            await sendMessage({
              text: data.message.body,
              headers: {
                "x-msg-id": data.message.id,
                "x-user-name": data.message.user.name,
                "x-user-avatar": data.message.user.avatar ?? "",
              },
            });
          } catch {
            /* best-effort */
          }
        }
        return true;
      } catch (e) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setLoadError(e instanceof Error ? e.message : "Could not send.");
        return false;
      }
    },
    [ablyConnected, inviteToken, sendMessage],
  );

  const composerStyles = useMemo(
    () => ({
      composerRow: styles.composerRow,
      input: styles.input,
      sendBtn: styles.sendBtn,
      sendBtnDisabled: styles.sendBtnDisabled,
    }),
    [],
  );

  const composerRow = (
    <RoundGroupChatComposer
      styles={composerStyles}
      sendBusy={sendBusy}
      onSend={handleSend}
      onComposerFocus={onComposerFocus}
    />
  );

  const invertedMessages = useMemo(() => [...messages].reverse(), [messages]);
  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <ChatBubbleRow message={item} isMine={resolveMine(item)} />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewerId],
  );
  const renderBubbleInline = useCallback(
    (m: ChatMessage) => (
      <ChatBubbleRow key={m.id} message={m} isMine={resolveMine(m)} />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewerId],
  );
  const keyExtractor = useCallback((m: ChatMessage) => m.id, []);

  // ─── Fullscreen: inverted FlatList, manual keyboard padding ───
  if (isFullscreen) {
    return (
      <View style={[styles.fullscreenRoot, { paddingBottom: keyboardPadding }]}>
        <FlatList
          data={invertedMessages}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          inverted
          contentContainerStyle={styles.invertedListContent}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          ListEmptyComponent={
            loading ? null : (
              <View style={styles.emptyInverted}>
                <Text style={styles.empty}>No messages yet. Say hi!</Text>
              </View>
            )
          }
        />

        {loadError ? <Text style={styles.errorInline}>{loadError}</Text> : null}

        <View style={{ paddingBottom: composerBottomPadding }}>{composerRow}</View>
      </View>
    );
  }

  // ─── Inline ───
  const messagesColumn = (
    <>
      {loading && messages.length === 0 ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={colors.fairway} size="small" />
        </View>
      ) : loadError && messages.length === 0 ? (
        <Text style={styles.errorInline}>{loadError}</Text>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={[styles.messageList, { maxHeight: MAX_LIST_HEIGHT }]}
          contentContainerStyle={[styles.messageListContent, { paddingBottom: 12 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {messages.length === 0 ? (
            <Text style={styles.empty}>No messages yet. Say hi!</Text>
          ) : (
            messages.map(renderBubbleInline)
          )}
        </ScrollView>
      )}
      {loadError && messages.length > 0 ? (
        <Text style={styles.errorInline}>{loadError}</Text>
      ) : null}
    </>
  );

  return (
    <RoundDetailSection
      title="Group chat"
      hint="Host and confirmed players only."
      icon="chatbubbles-outline"
      expanded={expanded}
      onToggle={() => setExpanded((e) => !e)}
    >
      {messagesColumn}
      {composerRow}
    </RoundDetailSection>
  );
}
