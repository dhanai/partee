import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

const STORE_PREFIX = "chat.lastRead:";

type ChatUnreadContextValue = {
  hasAnyUnreadChat: boolean;
  isRoundChatUnread: (inviteToken: string) => boolean;
  markChatRead: (inviteToken: string) => void;
  reportRounds: (rounds: Array<{ inviteToken: string; lastChatMessageAt?: string | null }>) => void;
};

const ChatUnreadContext = createContext<ChatUnreadContextValue | null>(null);

function loadLastReadAt(inviteToken: string): string | null {
  try {
    return SecureStore.getItem(`${STORE_PREFIX}${inviteToken}`);
  } catch {
    return null;
  }
}

function persistLastReadAt(inviteToken: string, iso: string) {
  try {
    SecureStore.setItem(`${STORE_PREFIX}${inviteToken}`, iso);
  } catch {
    /* best-effort */
  }
}

export function ChatUnreadProvider({ children }: { children: ReactNode }) {
  const [unreadTokens, setUnreadTokens] = useState<Set<string>>(new Set());
  const lastReadMap = useRef<Map<string, string>>(new Map());

  const reportRounds = useCallback(
    (rounds: Array<{ inviteToken: string; lastChatMessageAt?: string | null }>) => {
      const next = new Set<string>();
      for (const r of rounds) {
        if (!r.lastChatMessageAt) continue;
        const msgTime = new Date(r.lastChatMessageAt).getTime();
        if (Number.isNaN(msgTime)) continue;

        let readIso = lastReadMap.current.get(r.inviteToken);
        if (readIso === undefined) {
          readIso = loadLastReadAt(r.inviteToken) ?? "";
          if (readIso) lastReadMap.current.set(r.inviteToken, readIso);
        }

        if (!readIso || msgTime > new Date(readIso).getTime()) {
          next.add(r.inviteToken);
        }
      }
      setUnreadTokens((prev) => {
        if (prev.size === next.size && [...next].every((t) => prev.has(t))) return prev;
        return next;
      });
    },
    [],
  );

  const markChatRead = useCallback((inviteToken: string) => {
    const now = new Date().toISOString();
    lastReadMap.current.set(inviteToken, now);
    persistLastReadAt(inviteToken, now);
    setUnreadTokens((prev) => {
      if (!prev.has(inviteToken)) return prev;
      const next = new Set(prev);
      next.delete(inviteToken);
      return next;
    });
  }, []);

  const isRoundChatUnread = useCallback(
    (inviteToken: string) => unreadTokens.has(inviteToken),
    [unreadTokens],
  );

  const value = useMemo(
    () => ({
      hasAnyUnreadChat: unreadTokens.size > 0,
      isRoundChatUnread,
      markChatRead,
      reportRounds,
    }),
    [unreadTokens, isRoundChatUnread, markChatRead, reportRounds],
  );

  return (
    <ChatUnreadContext.Provider value={value}>{children}</ChatUnreadContext.Provider>
  );
}

export function useChatUnread() {
  const ctx = useContext(ChatUnreadContext);
  if (!ctx) {
    throw new Error("useChatUnread must be used within ChatUnreadProvider");
  }
  return ctx;
}
