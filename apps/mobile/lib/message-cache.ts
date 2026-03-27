import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_PREFIX = "msg_cache_";
const MAX_MESSAGES = 30;

import type { MessageAttachment } from "./attachment-types";

export type CachedMessage = {
  id: string;
  body: string | null;
  attachments?: MessageAttachment[] | null;
  createdAt: string;
  isMine: boolean;
  parentId?: string | null;
  parentPreview?: { body: string; senderName: string } | null;
  user: { id: string; name: string; avatar: string | null };
  reactions: Record<string, { count: number; userIds: string[] }>;
};

function key(conversationId: string): string {
  return `${KEY_PREFIX}${conversationId}`;
}

export async function getCachedMessages(conversationId: string): Promise<CachedMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(key(conversationId));
    if (!raw) return [];
    const msgs = JSON.parse(raw) as CachedMessage[];
    return msgs.filter((m) => !m.id.startsWith("optimistic-"));
  } catch {
    return [];
  }
}

export async function setCachedMessages(
  conversationId: string,
  messages: CachedMessage[],
): Promise<void> {
  try {
    const toCache = messages
      .filter((m) => !m.id.startsWith("optimistic-"))
      .slice(-MAX_MESSAGES);
    await AsyncStorage.setItem(key(conversationId), JSON.stringify(toCache));
  } catch {
    /* best-effort */
  }
}

export async function clearMessageCache(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const msgKeys = allKeys.filter((k) => k.startsWith(KEY_PREFIX));
    if (msgKeys.length > 0) {
      await AsyncStorage.multiRemove(msgKeys);
    }
  } catch {
    /* best-effort */
  }
}

export function mergeMessages(
  cached: CachedMessage[],
  fresh: CachedMessage[],
): CachedMessage[] {
  const byId = new Map<string, CachedMessage>();
  for (const m of cached) byId.set(m.id, m);
  for (const m of fresh) byId.set(m.id, m);
  return [...byId.values()].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}
