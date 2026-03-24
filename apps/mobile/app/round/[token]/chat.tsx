import { useLocalSearchParams } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import { useChatUnread } from "../../../lib/chat-unread-context";
import { RoundGroupChat } from "../../../components/round-group-chat";

export default function RoundGroupChatScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const { markChatRead } = useChatUnread();

  useEffect(() => {
    if (!token) return;
    markChatRead(token);
    return () => markChatRead(token);
  }, [token, markChatRead]);

  if (!token) {
    return null;
  }

  return (
    <View style={{ flex: 1 }}>
      <RoundGroupChat
        inviteToken={token}
        getToken={() => getTokenRef.current()}
        variant="fullscreen"
      />
    </View>
  );
}
