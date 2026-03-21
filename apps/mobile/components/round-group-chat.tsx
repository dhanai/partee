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
  user: { id: string; name: string; avatar: string | null };
};

type MessagesResponse = { messages: ChatMessage[] };

const POLL_MS = 2800;
const MAX_LIST_HEIGHT = 240;

type Props = {
  inviteToken: string;
  getToken: () => Promise<string | null>;
};

export function RoundGroupChat({ inviteToken, getToken }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const meId = getCachedMeProfile()?.id ?? null;

  const fetchInitial = useCallback(async () => {
    try {
      const authToken = await getToken();
      if (!authToken) return;
      const data = await apiGet<MessagesResponse>(
        `/api/rounds/${inviteToken}/messages`,
        authToken,
      );
      setMessages(data.messages ?? []);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load chat.");
    } finally {
      setLoading(false);
    }
  }, [inviteToken, getToken]);

  useEffect(() => {
    setLoading(true);
    void fetchInitial();
  }, [fetchInitial]);

  useEffect(() => {
    if (!expanded) return;
    const id = setInterval(() => {
      void (async () => {
        const list = messagesRef.current;
        try {
          const authToken = await getToken();
          if (!authToken) return;
          if (list.length === 0) {
            const data = await apiGet<MessagesResponse>(
              `/api/rounds/${inviteToken}/messages`,
              authToken,
            );
            const incoming = data.messages ?? [];
            if (incoming.length > 0) setMessages(incoming);
            return;
          }
          const last = list[list.length - 1];
          const data = await apiGet<MessagesResponse>(
            `/api/rounds/${inviteToken}/messages?after=${encodeURIComponent(last.id)}`,
            authToken,
          );
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
  }, [expanded, inviteToken, getToken]);

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
      const authToken = await getToken();
      if (!authToken) {
        setLoadError("Sign in to send a message.");
        return;
      }
      const data = await apiPost<{ message: ChatMessage }>(
        `/api/rounds/${inviteToken}/messages`,
        { body: text },
        authToken,
      );
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
                  const mine = meId != null && m.user.id === meId;
                  return (
                    <View
                      key={m.id}
                      style={[styles.bubbleRow, mine && styles.bubbleRowMine]}
                    >
                      {!mine ? (
                        m.user.avatar ? (
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
                        )
                      ) : (
                        <View style={styles.avatarSpacer} />
                      )}
                      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                        {!mine ? (
                          <Text style={styles.bubbleName}>{m.user.name}</Text>
                        ) : null}
                        <Text
                          style={[styles.bubbleBody, mine && styles.bubbleBodyMine]}
                        >
                          {m.body}
                        </Text>
                        <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>
                          {formatTime(m.createdAt)}
                        </Text>
                      </View>
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
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    maxWidth: "100%",
  },
  bubbleRowMine: { flexDirection: "row-reverse" },
  avatar: { width: 28, height: 28, borderRadius: 999 },
  avatarFallback: {
    backgroundColor: colors.fairwaySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { fontSize: 11, fontWeight: "700", color: colors.fairway },
  avatarSpacer: { width: 28 },
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
