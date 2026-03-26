import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { useNavigation } from "@react-navigation/native";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { ChatHeaderAvatars, ChatHeaderInfoButton } from "../../../components/chat-header-avatars";
import { useChatUnread } from "../../../lib/chat-unread-context";
import { apiPost } from "../../../lib/api";
import { fetchRoundDetailsAndCache } from "../../../lib/round-details-cache";
import { RoundGroupChat } from "../../../components/round-group-chat";

type HeaderMeta = { title: string; avatars: string[] };

export default function RoundGroupChatScreen() {
  const {
    token,
    chatTitle: paramTitle,
    chatAvatars: paramAvatarsJson,
    chatType: paramType,
  } = useLocalSearchParams<{
    token: string;
    chatTitle?: string;
    chatAvatars?: string;
    chatType?: string;
  }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const { markChatRead } = useChatUnread();

  const paramAvatars = useMemo<string[]>(() => {
    if (!paramAvatarsJson) return [];
    try { return JSON.parse(paramAvatarsJson); } catch { return []; }
  }, [paramAvatarsJson]);

  const [meta, setMeta] = useState<HeaderMeta | null>(() =>
    paramAvatars.length > 0
      ? { title: paramTitle ?? "Group chat", avatars: paramAvatars }
      : paramTitle
        ? { title: paramTitle, avatars: [] }
        : null,
  );

  useEffect(() => {
    if (meta || !token) return;
    void (async () => {
      try {
        const authToken = await getTokenRef.current();
        const round = await fetchRoundDetailsAndCache(token, authToken);
        const playerAvatars = round.confirmedPlayers
          .map((p) => p.avatar)
          .filter((a): a is string => Boolean(a));
        const headerAvatars =
          round.mode === "scheduled" && round.imageUrl
            ? [round.imageUrl, ...playerAvatars]
            : playerAvatars;
        const datePart = (round.teeTime ?? round.targetDate)
          ? new Date(round.teeTime ?? round.targetDate).toLocaleDateString(
              "en-US",
              { month: "short", day: "numeric" },
            )
          : "";
        setMeta({
          title:
            round.mode === "scheduled" && round.courseName
              ? `${round.courseName} · ${datePart}`
              : datePart || "Group chat",
          avatars: headerAvatars.slice(0, 4),
        });
      } catch {
        setMeta({ title: "Group chat", avatars: [] });
      }
    })();
  }, [token, meta]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <ChatHeaderAvatars
          type={paramType ?? "round"}
          title={meta?.title ?? "Group chat"}
          avatars={meta?.avatars ?? []}
        />
      ),
      headerRight: () => (
        <ChatHeaderInfoButton
          onPress={() =>
            router.push({
              pathname: "/chat-info",
              params: {
                roundToken: token ?? "",
                chatType: "round",
              },
            })
          }
        />
      ),
    });
  }, [navigation, meta, paramType, router, token]);

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
