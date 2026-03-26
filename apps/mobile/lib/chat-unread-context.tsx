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
  markRoundChatUnread: (inviteToken: string) => void;
  reportRounds: (rounds: Array<{ inviteToken: string; isChatUnread?: boolean }>) => void;
  unreadConversationIds: Set<string>;
  markConversationRead: (conversationId: string) => void;
  reportConversations: (convos: Array<{ id: string; isUnread: boolean }>) => void;
  resetUnread: () => void;
};

const ChatUnreadContext = createContext<ChatUnreadContextValue | null>(null);

export function ChatUnreadProvider({ children }: { children: ReactNode }) {
  const [unreadTokens, setUnreadTokens] = useState<Set<string>>(new Set());
  const [unreadConvIds, setUnreadConvIds] = useState<Set<string>>(new Set());

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

  const markRoundChatUnread = useCallback((inviteToken: string) => {
    setUnreadTokens((prev) => {
      if (prev.has(inviteToken)) return prev;
      const next = new Set(prev);
      next.add(inviteToken);
      return next;
    });
  }, []);

  const isRoundChatUnread = useCallback(
    (inviteToken: string) => unreadTokens.has(inviteToken),
    [unreadTokens],
  );

  const reportConversations = useCallback(
    (convos: Array<{ id: string; isUnread: boolean }>) => {
      setUnreadConvIds((prev) => {
        const next = new Set(prev);
        for (const c of convos) {
          if (c.isUnread) next.add(c.id);
          else next.delete(c.id);
        }
        if (prev.size === next.size && [...next].every((t) => prev.has(t))) return prev;
        return next;
      });
    },
    [],
  );

  const markConversationRead = useCallback((conversationId: string) => {
    setUnreadConvIds((prev) => {
      if (!prev.has(conversationId)) return prev;
      const next = new Set(prev);
      next.delete(conversationId);
      return next;
    });
  }, []);

  const resetUnread = useCallback(() => {
    setUnreadTokens(new Set());
    setUnreadConvIds(new Set());
  }, []);

  const value = useMemo(
    () => ({
      hasAnyUnreadChat: unreadTokens.size > 0 || unreadConvIds.size > 0,
      isRoundChatUnread,
      markChatRead,
      markRoundChatUnread,
      reportRounds,
      unreadConversationIds: unreadConvIds,
      markConversationRead,
      reportConversations,
      resetUnread,
    }),
    [unreadTokens, unreadConvIds, isRoundChatUnread, markChatRead, markRoundChatUnread, reportRounds, markConversationRead, reportConversations, resetUnread],
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
