import { memo } from "react";
import { Image, Text, View } from "react-native";
import { toAbsoluteUrl } from "../lib/api";
import { type ChatMessage, roundGroupChatStyles as styles } from "./round-group-chat-poll";

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

type Props = {
  message: ChatMessage;
  isMine: boolean;
};

export const ChatBubbleRow = memo(function ChatBubbleRow({ message: m, isMine }: Props) {
  const avatarEl = m.user.avatar ? (
    <Image source={{ uri: toAbsoluteUrl(m.user.avatar) }} style={styles.avatar} />
  ) : (
    <View style={[styles.avatar, styles.avatarFallback]}>
      <Text style={styles.avatarInitial}>
        {m.user.name.trim().charAt(0).toUpperCase() || "?"}
      </Text>
    </View>
  );

  return (
    <View style={styles.bubbleRow}>
      {isMine ? (
        <>
          <View style={styles.bubbleRowFlex} />
          <View style={[styles.bubble, styles.bubbleMine]}>
            <Text style={[styles.bubbleBody, styles.bubbleBodyMine]}>{m.body}</Text>
            <Text style={[styles.bubbleTime, styles.bubbleTimeMine]}>{formatTime(m.createdAt)}</Text>
          </View>
          {avatarEl}
        </>
      ) : (
        <>
          {avatarEl}
          <View style={[styles.bubble, styles.bubbleTheirs]}>
            <Text style={styles.bubbleName}>{m.user.name}</Text>
            <Text style={styles.bubbleBody}>{m.body}</Text>
            <Text style={styles.bubbleTime}>{formatTime(m.createdAt)}</Text>
          </View>
        </>
      )}
    </View>
  );
});
