import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { apiGet, apiPost, toAbsoluteUrl } from "../lib/api";
import { getCachedMeProfile } from "../lib/me-profile-cache";
import { colors } from "../lib/theme";

export type ChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  /** Set by API so layout never depends on a separate viewerId update (avoids left/right race). */
  isMine?: boolean;
  user: { id: string; name: string; avatar: string | null };
};

type MessagesResponse = { messages: ChatMessage[]; viewerId?: string };

const POLL_MS = 2800;
const MAX_LIST_HEIGHT = 240;

type Props = {
  inviteToken: string;
  getToken: () => Promise<string | null>;
  /** Parent scrolls so the composer stays above the keyboard (round detail screen). */
  onComposerFocus?: () => void;
};

export function RoundGroupChat({ inviteToken, getToken, onComposerFocus }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  /** Parent often passes `() => getToken()` inline → new ref every render; must not sit in useCallback deps. */
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const inviteTokenRef = useRef(inviteToken);
  inviteTokenRef.current = inviteToken;
  const [viewerId, setViewerId] = useState<string | null>(() => getCachedMeProfile()?.id ?? null);
  /** Ignore chat GET responses after token changed or a newer load started (prevents stale viewer/messages). */
  const loadGenRef = useRef(0);

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

  useEffect(() => {
    if (!expanded) return;
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
              return v || prev || null;
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
            return v || prev || null;
          });
          const incoming = data.messages ?? [];
          if (incoming.length === 0) return;
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            const merged = [...prev];
            for (const m of incoming) {
              if (!seen.has(m.id)) {
                seen.add(m.id);
                merged.push(m);
              }
            }
            return merged;
          });
        } catch {
          /* ignore poll errors */
        }
      })();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [expanded, inviteToken]);

  useEffect(() => {
    if (messages.length === 0) return;
    const t = requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: false });
    });
    return () => cancelAnimationFrame(t);
  }, [messages.length, expanded]);

  async function send() {
    const text = draft.trim();
    if (!text || sendBusy) return;
    setSendBusy(true);
    setLoadError(null);
    try {
      const authToken = await getTokenRef.current();
      if (!authToken) {
        setLoadError("Sign in to send a message.");
        return;
      }
      const data = await apiPost<MessagesResponse & { message: ChatMessage }>(
        `/api/rounds/${inviteToken}/messages`,
        { body: text },
        authToken,
      );
      const vidSend = data.viewerId?.trim() || getCachedMeProfile()?.id?.trim();
      if (vidSend) setViewerId(vidSend);
      setDraft("");
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.message.id)) return prev;
        return [...prev, data.message];
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not send.");
    } finally {
      setSendBusy(false);
    }
  }

  function formatTime(iso: string) {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  return (
    <View style={styles.card}>
      <Pressable
        style={styles.headerRow}
        onPress={() => setExpanded((e) => !e)}
        accessibilityRole="button"
        accessibilityLabel={expanded ? "Collapse group chat" : "Expand group chat"}
      >
        <Text style={styles.sectionTitle}>Group chat</Text>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={20}
          color={colors.fairway}
        />
      </Pressable>
      <Text style={styles.hint}>Host and confirmed players only.</Text>

      {expanded ? (
        <>
          {loading ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator color={colors.fairway} size="small" />
            </View>
          ) : loadError && messages.length === 0 ? (
            <Text style={styles.errorInline}>{loadError}</Text>
          ) : (
            <ScrollView
              ref={scrollRef}
              style={[styles.messageList, { maxHeight: MAX_LIST_HEIGHT }]}
              contentContainerStyle={styles.messageListContent}
              keyboardShouldPersistTaps="handled"
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

          <View style={styles.composerRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onFocus={() => onComposerFocus?.()}
              placeholder="Message the group…"
              placeholderTextColor={colors.muted}
              style={styles.input}
              multiline
              maxLength={2000}
              editable={!sendBusy}
            />
            <Pressable
              style={[styles.sendBtn, sendBusy && styles.sendBtnDisabled]}
              onPress={() => void send()}
              disabled={sendBusy || !draft.trim()}
              accessibilityLabel="Send message"
            >
              {sendBusy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="send" size={18} color="#fff" />
              )}
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 12,
    gap: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  hint: { color: colors.muted, fontSize: 12, marginTop: -4 },
  loaderWrap: { paddingVertical: 16, alignItems: "center" },
  messageList: { marginTop: 4 },
  messageListContent: { gap: 10, paddingBottom: 4 },
  empty: { color: colors.muted, fontSize: 13, paddingVertical: 8, textAlign: "center" },
  bubbleRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    maxWidth: "100%",
  },
  /** Pushes “mine” row (bubble + avatar) to the right. */
  bubbleRowFlex: { flex: 1, minWidth: 0 },
  avatar: { width: 28, height: 28, borderRadius: 999 },
  avatarFallback: {
    backgroundColor: colors.fairwaySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { fontSize: 11, fontWeight: "700", color: colors.fairway },
  bubble: {
    flexShrink: 1,
    maxWidth: "78%",
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
  composerRow: { flexDirection: "row", gap: 8, alignItems: "flex-end", marginTop: 4 },
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
