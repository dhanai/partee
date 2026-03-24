import { useCallback, useState } from "react";

/**
 * Typing presence stub. The TypingIndicator component is wired up and ready;
 * once Ably presence is connected through the shared AblyProvider, this hook
 * will publish and subscribe to typing events on `parfade:v1:typing:<convId>`.
 */
export function useTypingPresence(
  _conversationId: string | undefined,
  _myUserId: string | null,
  _myName: string,
) {
  const [typingNames] = useState<string[]>([]);

  const publishTyping = useCallback(() => {
    // Will publish Ably presence when integrated
  }, []);

  return { typingNames, publishTyping };
}
