import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
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

function getLastReadAt(inviteToken: string): string | null {
  try {
    return SecureStore.getItem(`${STORE_PREFIX}${inviteToken}`);
  } catch {
    return null;
  }
}

function setLastReadAt(inviteToken: string, iso: string) {
  try {
    SecureStore.setItem(`${STORE_PREFIX}${inviteToken}`, iso);
  } catch {
    /* best-effort */
  }
}

function isUnread(lastChatMessageAt: string | null | undefined, inviteToken: string): boolean {
  if (!lastChatMessageAt) return false;
  const lastRead = getLastReadAt(inviteToken);
  if (!lastRead) return true;
  return new Date(lastChatMessageAt).getTime() > new Date(lastRead).getTime();
}

export function ChatUnreadProvider({ children }: { children: ReactNode }) {
  const [unreadTokens, setUnreadTokens] = useState<Set<string>>(new Set());

  const reportRounds = useCallback(
    (rounds: Array<{ inviteToken: string; lastChatMessageAt?: string | null }>) => {
      const next = new Set<string>();
      for (const r of rounds) {
        if (isUnread(r.lastChatMessageAt, r.inviteToken)) {
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
    setLastReadAt(inviteToken, new Date().toISOString());
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
