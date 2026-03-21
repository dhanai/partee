import { useLocalSearchParams } from "expo-router";
import { useHeaderHeight } from "@react-navigation/elements";
import { useAuth } from "@clerk/clerk-expo";
import { useRef } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { RoundGroupChat } from "../../../components/round-group-chat";

export default function RoundGroupChatScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const headerHeight = useHeaderHeight();

  if (!token) {
    return null;
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={headerHeight + 8}
    >
      <View style={{ flex: 1 }}>
        <RoundGroupChat
          inviteToken={token}
          getToken={() => getTokenRef.current()}
          variant="fullscreen"
        />
      </View>
    </KeyboardAvoidingView>
  );
}
