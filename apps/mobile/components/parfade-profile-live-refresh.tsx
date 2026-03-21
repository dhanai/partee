import type { Message } from "ably";
import { useAbly } from "ably/react";
import { useEffect } from "react";
import { parfadeProfileChannel } from "../lib/parfade-ably-channels";
import { parseParfadeRealtimeMessage } from "../lib/parfade-ably-messages";

const PARFADE_EVENT = "parfade";

/**
 * Refetches profile when the owner updates (server publishes to `parfade:v1:profile:{userId}`).
 * Render only when inside AblyProvider (e.g. when `useAblyChatMounted()` is true).
 */
export function ParfadeProfileLiveRefresh({
  profileUserId,
  onProfileMaybeUpdated,
}: {
  profileUserId: string;
  onProfileMaybeUpdated: () => void;
}) {
  const ably = useAbly();

  useEffect(() => {
    if (!profileUserId) return;
    const channel = ably.channels.get(parfadeProfileChannel(profileUserId));
    const handler = (message: Message) => {
      const parsed = parseParfadeRealtimeMessage(message.data);
      if (parsed?.type === "profile-updated" && parsed.userId === profileUserId) {
        onProfileMaybeUpdated();
      }
    };
    void channel.subscribe(PARFADE_EVENT, handler);
    return () => {
      void channel.unsubscribe(PARFADE_EVENT, handler);
    };
  }, [ably, profileUserId, onProfileMaybeUpdated]);

  return null;
}
