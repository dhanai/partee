import type { Message } from "ably";
import { useAbly } from "ably/react";
import { useEffect } from "react";
import { parfadeRoundDetailChannel } from "../lib/parfade-ably-channels";
import { parseParfadeRealtimeMessage } from "../lib/parfade-ably-messages";

const PARFADE_EVENT = "parfade";

/**
 * Refetches round detail when anyone updates the round (host finalize/edit, RSVP, invites, chat preview).
 * Render only under AblyProvider.
 */
export function ParfadeRoundDetailLiveRefresh({
  inviteToken,
  onRoundMaybeUpdated,
}: {
  inviteToken: string;
  onRoundMaybeUpdated: () => void;
}) {
  const ably = useAbly();
  const t = inviteToken.trim();

  useEffect(() => {
    if (!t) return;
    const channel = ably.channels.get(parfadeRoundDetailChannel(t));
    const handler = (message: Message) => {
      const parsed = parseParfadeRealtimeMessage(message.data);
      if (parsed?.type === "round-detail-updated" && parsed.inviteToken === t) {
        onRoundMaybeUpdated();
      }
    };
    void channel.subscribe(PARFADE_EVENT, handler);
    return () => {
      void channel.unsubscribe(PARFADE_EVENT, handler);
    };
  }, [ably, t, onRoundMaybeUpdated]);

  return null;
}
