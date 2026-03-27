import { useCallback, useState } from "react";

/**
 * Fallback stub when Ably Chat is not mounted.
 * The real typing is handled by AblyChatTyping in the chat screen
 * when ChatRoomProvider is available.
 */
export function useTypingPresence(
  _conversationId: string | undefined,
  _myUserId: string | null,
  _myName: string,
) {
  const [typingNames] = useState<string[]>([]);

  const publishTyping = useCallback(() => {
    // no-op when Ably Chat not available
  }, []);

  return { typingNames, publishTyping };
}
