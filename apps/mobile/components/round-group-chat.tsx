import { ChatRoomProvider } from "@ably/chat/react";
import { useAblyChatMounted } from "../lib/ably-chat-context";
import { roundChatRoomName } from "../lib/round-chat-room";
import { RoundGroupChatConnected } from "./round-group-chat-connected";
import { RoundGroupChatPoll, type ChatMessage, type RoundGroupChatProps } from "./round-group-chat-poll";

export type { ChatMessage, RoundGroupChatProps };

export function RoundGroupChat(props: RoundGroupChatProps) {
  const ably = useAblyChatMounted();
  if (!ably) {
    return <RoundGroupChatPoll {...props} />;
  }
  return (
    <ChatRoomProvider name={roundChatRoomName(props.inviteToken)}>
      <RoundGroupChatConnected {...props} />
    </ChatRoomProvider>
  );
}
