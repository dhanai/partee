import { ChatMessageEventType } from "@ably/chat";
import { useChatConnection, useMessages } from "@ably/chat/react";
import type { Message } from "ably";
import { useAbly } from "ably/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, ScrollView, Text, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet, apiPost, toAbsoluteUrl } from "../lib/api";
import { parfadeRoundDetailChannel } from "../lib/parfade-ably-channels";
import { parseParfadeRealtimeMessage } from "../lib/parfade-ably-messages";
import { getCachedMeProfile } from "../lib/me-profile-cache";
import { useGroupChatLayout } from "../lib/use-group-chat-layout";
import { colors } from "../lib/theme";
import { RoundGroupChatComposer } from "./round-group-chat-composer";
import { RoundDetailSection } from "./round-detail-section";
import {
  type ChatMessage,
  type RoundGroupChatProps,
  roundGroupChatStyles as styles,
} from "./round-group-chat-poll";

type MessagesResponse = { messages: ChatMessage[]; viewerId?: string };

const POLL_MS = 4200;
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

/**
 * Ably Chat carries mobile→mobile fan-out; web chat only POSTs to the API (no Ably Chat publish).
 * Server emits `round-detail-updated` / `chat-message` on `parfade:v1:round-detail:{token}` — subscribe
 * so laptop/web sends appear here while Ably Chat is connected (HTTP poll is disabled in that case).
 */
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
  const ably = useAbly();

  const {
    messageListPaddingBottom,
    onComposerLayout,
    onComposerFocus: onComposerFocusChat,
    stickyKeyboardOffset,
    stickyWrapStyle,
  } = useGroupChatLayout(isFullscreen, scrollRef, insets.bottom, onComposerFocus);

  const { currentStatus } = useChatConnection();
  const ablyConnected = currentStatus === "connected";

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

  /** Merge messages written via web/API (and any missed Chat events) using the same cursor as polling. */
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

  useEffect(() => {
    const t = inviteToken.trim();
    if (!t) return;
    const channel = ably.channels.get(parfadeRoundDetailChannel(t));
    const handler = (message: Message) => {
      const parsed = parseParfadeRealtimeMessage(message.data);
      if (
        parsed?.type === "round-detail-updated" &&
        parsed.inviteToken === t &&
        parsed.reason === "chat-message"
      ) {
        void pullNewMessagesFromApi();
      }
    };
    void channel.subscribe(PARFADE_EVENT, handler);
    return () => {
      void channel.unsubscribe(PARFADE_EVENT, handler);
    };
  }, [ably, inviteToken, pullNewMessagesFromApi]);

  useEffect(() => {
    setMessages([]);
    setLoadError(null);
    setLoading(true);
    void fetchInitial();
  }, [fetchInitial]);

  const pollActive = isFullscreen || expanded;

  useEffect(() => {
    if (!pollActive || ablyConnected) return;
    const id = setInterval(() => {
      void pullNewMessagesFromApi();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [pollActive, ablyConnected, pullNewMessagesFromApi]);

  useEffect(() => {
    if (!pollActive) return;
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
  }, [messages.length, pollActive]);

  const handleSend = useCallback(
    async (text: string): Promise<boolean> => {
      const trimmed = text.trim();
      if (!trimmed) return false;
      setSendBusy(true);
      setLoadError(null);
      try {
        const authToken = await getTokenRef.current();
        if (!authToken) {
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
          if (prev.some((m) => m.id === data.message.id)) return prev;
          return sortMessagesByTime([...prev, data.message]);
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
            /* Realtime fan-out is best-effort; polling still works */
          }
        }
        return true;
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Could not send.");
        return false;
      } finally {
        setSendBusy(false);
      }
    },
    [ablyConnected, inviteToken, sendMessage],
  );

  function formatTime(iso: string) {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    } catch {
      return "";
    }
  }

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
      onComposerFocus={onComposerFocusChat}
    />
  );

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
          style={[
            styles.messageList,
            isFullscreen ? styles.messageListFlex : { maxHeight: MAX_LIST_HEIGHT },
          ]}
          contentContainerStyle={[
            styles.messageListContent,
            { paddingBottom: messageListPaddingBottom },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {messages.length === 0 ? (
            <Text style={styles.empty}>No messages yet. Say hi!</Text>
          ) : (
            messages.map((m) => {
              const mine = resolveMine(m);
              const avatarEl = m.user.avatar ? (
                <Image
                  source={{ uri: toAbsoluteUrl(m.user.avatar) }}
                  style={styles.avatar}
                />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarInitial}>
                    {m.user.name.trim().charAt(0).toUpperCase() || "?"}
                  </Text>
                </View>
              );
              return (
                <View key={m.id} style={styles.bubbleRow}>
                  {mine ? (
                    <>
                      <View style={styles.bubbleRowFlex} />
                      <View style={[styles.bubble, styles.bubbleMine]}>
                        <Text style={[styles.bubbleBody, styles.bubbleBodyMine]}>{m.body}</Text>
                        <Text style={[styles.bubbleTime, styles.bubbleTimeMine]}>
                          {formatTime(m.createdAt)}
                        </Text>
                      </View>
                      {avatarEl}
                    </>
                  ) : (
                    <>
                      {avatarEl}
                      <View style={[styles.bubble, styles.bubbleTheirs]}>
                        <Text style={styles.bubbleName}>{m.user.name}</Text>
                        <Text style={styles.bubbleBody}>{m.body}</Text>
                        <Text style={styles.bubbleTime}>{formatTime(m.createdAt)}</Text>
                      </View>
                    </>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {loadError && messages.length > 0 ? (
        <Text style={styles.errorInline}>{loadError}</Text>
      ) : null}
    </>
  );

  if (isFullscreen) {
    return (
      <View style={styles.fullscreenRoot}>
        {messagesColumn}
        <KeyboardStickyView
          offset={stickyKeyboardOffset}
          style={[styles.stickyComposerWrap, stickyWrapStyle]}
        >
          <View onLayout={onComposerLayout}>{composerRow}</View>
        </KeyboardStickyView>
      </View>
    );
  }

  const chatBody = (
    <>
      {messagesColumn}
      {composerRow}
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
      {chatBody}
    </RoundDetailSection>
  );
}
