import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ChatUnreadContextValue = {
  hasAnyUnreadChat: boolean;
  isRoundChatUnread: (inviteToken: string) => boolean;
  markChatRead: (inviteToken: string) => void;
  reportRounds: (rounds: Array<{ inviteToken: string; isChatUnread?: boolean }>) => void;
};

const ChatUnreadContext = createContext<ChatUnreadContextValue | null>(null);

export function ChatUnreadProvider({ children }: { children: ReactNode }) {
  const [unreadTokens, setUnreadTokens] = useState<Set<string>>(new Set());

  const reportRounds = useCallback(
    (rounds: Array<{ inviteToken: string; isChatUnread?: boolean }>) => {
      setUnreadTokens((prev) => {
        const next = new Set(prev);
        for (const r of rounds) {
          if (r.isChatUnread) {
            next.add(r.inviteToken);
          } else {
            next.delete(r.inviteToken);
          }
        }
        if (prev.size === next.size && [...next].every((t) => prev.has(t))) return prev;
        return next;
      });
    },
    [],
  );

  const markChatRead = useCallback((inviteToken: string) => {
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
