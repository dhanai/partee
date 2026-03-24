import { useLocalSearchParams } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import { useChatUnread } from "../../../lib/chat-unread-context";
import { apiPost } from "../../../lib/api";
import { RoundGroupChat } from "../../../components/round-group-chat";

export default function RoundGroupChatScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const { markChatRead } = useChatUnread();

  useEffect(() => {
    if (!token) return;

    const sendReadReceipt = async () => {
      markChatRead(token);
      try {
        const authToken = await getTokenRef.current();
        await apiPost("/api/rounds/chats/read", { inviteToken: token }, authToken);
      } catch {
        /* best-effort */
      }
    };

    void sendReadReceipt();
    return () => void sendReadReceipt();
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
