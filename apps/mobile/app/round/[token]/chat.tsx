import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { fetchRoundDetailsAndCache, getCachedRoundDetails } from "../../../lib/round-details-cache";
import { colors } from "../../../lib/theme";

/**
 * Legacy route kept for deep links and push notifications that reference
 * /round/[token]/chat. Resolves the round's conversationId and replaces
 * the navigation to the unified conversation chat screen.
 */
export default function RoundChatRedirect() {
  const { token, chatTitle, chatAvatars, chatType } = useLocalSearchParams<{
    token: string;
    chatTitle?: string;
    chatAvatars?: string;
    chatType?: string;
  }>();
  const router = useRouter();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const [ready, setReady] = useState(false);
  const didRedirect = useRef(false);

  useEffect(() => {
    if (!token || didRedirect.current) return;

    const cached = getCachedRoundDetails(token);
    if (cached?.conversationId) {
      didRedirect.current = true;
      router.replace({
        pathname: "/conversation/[id]/chat",
        params: {
          id: cached.conversationId,
          ...(chatTitle ? { chatTitle } : {}),
          ...(chatAvatars ? { chatAvatars } : {}),
          chatType: chatType ?? "round",
        },
      });
      return;
    }

    void (async () => {
      try {
        const authToken = await getTokenRef.current();
        const round = await fetchRoundDetailsAndCache(token, authToken);
        if (round.conversationId && !didRedirect.current) {
          didRedirect.current = true;
          router.replace({
            pathname: "/conversation/[id]/chat",
            params: {
              id: round.conversationId,
              ...(chatTitle ? { chatTitle } : {}),
              ...(chatAvatars ? { chatAvatars } : {}),
              chatType: chatType ?? "round",
            },
          });
        }
      } catch {
        /* user can hit back */
      } finally {
        setReady(true);
      }
    })();
  }, [token, chatTitle, chatAvatars, chatType, router]);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={colors.fairway} />
      </View>
    );
  }

  return null;
}
