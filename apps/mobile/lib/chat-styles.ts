import { StyleSheet } from "react-native";
import { colors } from "./theme";

import type { MessageAttachment } from "./attachment-types";

export type ChatMessage = {
  id: string;
  body: string | null;
  attachments?: MessageAttachment[] | null;
  createdAt: string;
  isMine?: boolean;
  parentId?: string | null;
  parentPreview?: { body: string; senderName: string } | null;
  user: { id: string; name: string; avatar: string | null };
  reactions?: Record<string, { count: number; userIds: string[] }>;
};

export const chatBubbleStyles = StyleSheet.create({
  bubbleRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    maxWidth: "100%",
  },
  bubbleRowFlex: { flex: 1, minWidth: 0 },
  avatar: { width: 28, height: 28, borderRadius: 999 },
  avatarFallback: {
    backgroundColor: colors.fairwaySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { fontSize: 11, fontWeight: "700", color: colors.fairway },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleTheirs: {
    backgroundColor: "#f1efea",
  },
  bubbleMine: { backgroundColor: colors.fairway },
  bubbleName: { fontSize: 11, fontWeight: "700", color: colors.muted, marginBottom: 2 },
  bubbleBody: { fontSize: 15, color: colors.text },
  bubbleBodyMine: { color: "#fff" },
  bubbleTime: { fontSize: 10, color: colors.muted, marginTop: 4, alignSelf: "flex-end" },
  bubbleTimeMine: { color: "rgba(255,255,255,0.85)" },
});
