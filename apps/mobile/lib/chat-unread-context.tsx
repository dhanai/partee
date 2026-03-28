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
  unreadConversationIds: Set<string>;
  mutedConversationIds: Set<string>;
  markConversationRead: (conversationId: string) => void;
  markConversationUnread: (conversationId: string) => void;
  reportConversations: (convos: Array<{ id: string; isUnread: boolean; muted?: boolean }>) => void;
  setConversationMuted: (conversationId: string, muted: boolean) => void;
  resetUnread: () => void;
};

const ChatUnreadContext = createContext<ChatUnreadContextValue | null>(null);

export function ChatUnreadProvider({ children }: { children: ReactNode }) {
  const [unreadConvIds, setUnreadConvIds] = useState<Set<string>>(new Set());
  const [mutedConvIds, setMutedConvIds] = useState<Set<string>>(new Set());

  const reportConversations = useCallback(
    (convos: Array<{ id: string; isUnread: boolean; muted?: boolean }>) => {
      setUnreadConvIds((prev) => {
        const next = new Set(prev);
        for (const c of convos) {
          if (c.isUnread) next.add(c.id);
          else next.delete(c.id);
        }
        if (prev.size === next.size && [...next].every((t) => prev.has(t))) return prev;
        return next;
      });
      setMutedConvIds(() => {
        const next = new Set<string>();
        for (const c of convos) {
          if (c.muted) next.add(c.id);
        }
        return next;
      });
    },
    [],
  );

  const setConversationMuted = useCallback((conversationId: string, muted: boolean) => {
    setMutedConvIds((prev) => {
      const next = new Set(prev);
      if (muted) next.add(conversationId);
      else next.delete(conversationId);
      return next;
    });
  }, []);

  const markConversationRead = useCallback((conversationId: string) => {
    setUnreadConvIds((prev) => {
      if (!prev.has(conversationId)) return prev;
      const next = new Set(prev);
      next.delete(conversationId);
      return next;
    });
  }, []);

  const markConversationUnread = useCallback((conversationId: string) => {
    setUnreadConvIds((prev) => {
      if (prev.has(conversationId)) return prev;
      const next = new Set(prev);
      next.add(conversationId);
      return next;
    });
  }, []);

  const resetUnread = useCallback(() => {
    setUnreadConvIds(new Set());
  }, []);

  const value = useMemo(
    () => ({
      hasAnyUnreadChat: unreadConvIds.size > 0,
      unreadConversationIds: unreadConvIds,
      mutedConversationIds: mutedConvIds,
      markConversationRead,
      markConversationUnread,
      reportConversations,
      setConversationMuted,
      resetUnread,
    }),
    [unreadConvIds, mutedConvIds, markConversationRead, markConversationUnread, reportConversations, setConversationMuted, resetUnread],
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
