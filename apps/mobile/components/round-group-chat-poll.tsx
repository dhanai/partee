import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet, apiPost } from "../lib/api";
import { GROUP_CHAT_COMPOSER_GAP } from "../lib/group-chat-layout-constants";
import { getCachedMeProfile } from "../lib/me-profile-cache";
import { useFullscreenChatKeyboard } from "../lib/use-group-chat-layout";
import { colors } from "../lib/theme";
import { ChatBubbleRow } from "./chat-bubble-row";
import { RoundGroupChatComposer } from "./round-group-chat-composer";
import { RoundDetailSection } from "./round-detail-section";

export type ChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  isMine?: boolean;
  user: { id: string; name: string; avatar: string | null };
};

type MessagesResponse = { messages: ChatMessage[]; viewerId?: string };

const POLL_MS = 4200;
const MAX_LIST_HEIGHT = 240;

export type RoundGroupChatProps = {
  inviteToken: string;
  getToken: () => Promise<string | null>;
  onComposerFocus?: () => void;
  variant?: "inline" | "fullscreen";
};

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

/** Polling-only chat (no Ably Chat client). */
export function RoundGroupChatPoll({
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
  const loadGenRef = useRef(0);
  const prevMessageCountRef = useRef(0);

  const { keyboardPadding, composerBottomPadding } = useFullscreenChatKeyboard(insets.bottom);

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

  useEffect(() => {
    setMessages([]);
    setLoadError(null);
    setLoading(true);
    void fetchInitial();
  }, [fetchInitial]);

  const pollActive = isFullscreen || expanded;

  useEffect(() => {
    if (!pollActive) return;
    const pollForToken = inviteToken;
    const id = setInterval(() => {
      void (async () => {
        if (inviteTokenRef.current !== pollForToken) return;
        const list = messagesRef.current;
        try {
          const authToken = await getTokenRef.current();
          if (!authToken) return;
          if (inviteTokenRef.current !== pollForToken) return;
          if (list.length === 0) {
            const data = await apiGet<MessagesResponse>(
              `/api/rounds/${pollForToken}/messages`,
              authToken,
            );
            if (inviteTokenRef.current !== pollForToken) return;
            setViewerId((prev) => {
              const v = data.viewerId?.trim() || getCachedMeProfile()?.id?.trim();
              const next = v || prev || null;
              return next === prev ? prev : next;
            });
            const incoming = data.messages ?? [];
            if (incoming.length > 0) setMessages(incoming);
            return;
          }
          const last = list[list.length - 1];
          const data = await apiGet<MessagesResponse>(
            `/api/rounds/${pollForToken}/messages?after=${encodeURIComponent(last.id)}`,
            authToken,
          );
          if (inviteTokenRef.current !== pollForToken) return;
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
            return added === 0 ? prev : merged;
          });
        } catch {
          /* ignore poll errors */
        }
      })();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [pollActive, inviteToken]);

  // Inline variant: scroll to end when new messages arrive
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
          return [...without, data.message];
        });
        return true;
      } catch (e) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setLoadError(e instanceof Error ? e.message : "Could not send.");
        return false;
      }
    },
    [inviteToken],
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

  const handleReaction = useCallback(
    (messageId: string, emoji: string, action: "add" | "remove") => {
      const vid = viewerId ?? "";
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const reactions = { ...(m as any).reactions } as Record<string, { count: number; userIds: string[] }>;
          const existing = reactions[emoji] ?? { count: 0, userIds: [] };
          if (action === "add") {
            if (!existing.userIds.includes(vid)) {
              reactions[emoji] = { count: existing.count + 1, userIds: [...existing.userIds, vid] };
            }
          } else {
            reactions[emoji] = {
              count: Math.max(0, existing.count - 1),
              userIds: existing.userIds.filter((id) => id !== vid),
            };
            if (reactions[emoji].count === 0) delete reactions[emoji];
          }
          return { ...m, reactions } as ChatMessage;
        }),
      );
    },
    [viewerId],
  );

  const invertedMessages = useMemo(() => [...messages].reverse(), [messages]);
  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <ChatBubbleRow message={item} isMine={resolveMine(item)} viewerId={viewerId} onReaction={handleReaction} />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewerId, handleReaction],
  );
  const renderBubbleInline = useCallback(
    (m: ChatMessage) => (
      <ChatBubbleRow key={m.id} message={m} isMine={resolveMine(m)} viewerId={viewerId} onReaction={handleReaction} />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewerId, handleReaction],
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

  // ─── Inline (collapsible section on round detail) ───
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

const styles = StyleSheet.create({
  fullscreenRoot: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 12,
  },
  loaderWrap: { paddingVertical: 16, alignItems: "center" },
  emptyFlex: { flex: 1, justifyContent: "center" },
  emptyInverted: { transform: [{ scaleY: -1 }], paddingVertical: 32 },
  messageList: { marginTop: 4 },
  messageListContent: { gap: 10, paddingBottom: 4 },
  invertedListContent: { gap: 10, paddingTop: GROUP_CHAT_COMPOSER_GAP },
  empty: { color: colors.muted, fontSize: 13, paddingVertical: 8, textAlign: "center" },
  bubbleRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    maxWidth: "100%",
  },
  bubbleRowFlex: { flex: 1, minWidth: 0 },
  avatar: { width: 28, height: 28, borderRadius: 999 },
  avatarFallback: {
    backgroundColor: colors.fairwaySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { fontSize: 11, fontWeight: "700", color: colors.fairway },
  bubble: {
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  bubbleTheirs: {
    backgroundColor: "#f1efea",
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleMine: { backgroundColor: colors.fairway },
  bubbleName: { fontSize: 11, fontWeight: "700", color: colors.muted, marginBottom: 2 },
  bubbleBody: { fontSize: 15, color: colors.text },
  bubbleBodyMine: { color: "#fff" },
  bubbleTime: { fontSize: 10, color: colors.muted, marginTop: 4, alignSelf: "flex-end" },
  bubbleTimeMine: { color: "rgba(255,255,255,0.85)" },
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
  sendBtnDisabled: { opacity: 0.5 },
  errorInline: { color: colors.danger, fontSize: 12 },
});

export const roundGroupChatStyles = styles;
