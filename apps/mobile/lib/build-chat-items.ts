import { getGroupStyle, type GroupStyle } from "./chat-group-styles";

const TIME_GAP_MS = 5 * 60 * 1000; // 5 minutes between timestamp rows

export type ChatListItem<M> =
  | { type: "message"; data: M; groupStyle: GroupStyle }
  | { type: "date"; date: string }
  | { type: "timestamp"; date: string };

type Msg = {
  id: string;
  createdAt: string;
  user: { id: string };
};

/**
 * Build an inverted (newest-first) list of messages, date separators, and
 * timestamp separators from a chronologically-sorted array of messages.
 */
export function buildChatItems<M extends Msg>(messages: M[]): ChatListItem<M>[] {
  const sorted = [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const items: ChatListItem<M>[] = [];
  const msgIndices: number[] = [];
  let lastDateStr = "";
  let lastTimestamp = 0;

  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i];
    const dayStr = new Date(m.createdAt).toDateString();
    const msgTime = new Date(m.createdAt).getTime();

    // Date separator on day boundary
    if (dayStr !== lastDateStr) {
      items.push({ type: "date", date: m.createdAt });
      lastDateStr = dayStr;
      lastTimestamp = msgTime;
    } else if (msgTime - lastTimestamp > TIME_GAP_MS) {
      // Timestamp separator on time gap
      items.push({ type: "timestamp", date: m.createdAt });
      lastTimestamp = msgTime;
    }

    items.push({ type: "message", data: m, groupStyle: "single" });
    msgIndices.push(items.length - 1);
  }

  // Compute group styles — separators break groups
  for (let i = 0; i < msgIndices.length; i++) {
    const idx = msgIndices[i];
    const item = items[idx] as { type: "message"; data: M; groupStyle: GroupStyle };

    const prevMsgIdx = i > 0 ? msgIndices[i - 1] : undefined;
    const nextMsgIdx = i < msgIndices.length - 1 ? msgIndices[i + 1] : undefined;

    // Only group if adjacent in the items array (no separator between)
    const prev =
      prevMsgIdx !== undefined && prevMsgIdx === idx - 1
        ? (items[prevMsgIdx] as { type: "message"; data: M }).data
        : undefined;
    const next =
      nextMsgIdx !== undefined && nextMsgIdx === idx + 1
        ? (items[nextMsgIdx] as { type: "message"; data: M }).data
        : undefined;

    item.groupStyle = getGroupStyle(item.data, prev, next);
  }

  return items.reverse();
}

export function chatItemKey<M extends Msg>(item: ChatListItem<M>): string {
  switch (item.type) {
    case "message":
      return item.data.id;
    case "date":
      return `date-${item.date}`;
    case "timestamp":
      return `ts-${item.date}`;
  }
}
