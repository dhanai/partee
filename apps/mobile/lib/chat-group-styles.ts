/**
 * Message grouping logic adapted from Stream Chat's getGroupStyles.
 * Groups consecutive messages from the same sender within a time window.
 * Returns a position for each message: 'single', 'top', 'middle', or 'bottom'.
 */

export type GroupStyle = "single" | "top" | "middle" | "bottom";

const MAX_GROUP_GAP_MS = 2 * 60 * 1000; // 2 minutes

type Msg = {
  user: { id: string };
  createdAt: string;
};

export function getGroupStyle(
  message: Msg,
  previousMessage: Msg | undefined,
  nextMessage: Msg | undefined,
): GroupStyle {
  const userId = message.user.id;

  const isTop =
    !previousMessage ||
    previousMessage.user.id !== userId ||
    timeDiff(previousMessage.createdAt, message.createdAt) > MAX_GROUP_GAP_MS;

  const isBottom =
    !nextMessage ||
    nextMessage.user.id !== userId ||
    timeDiff(message.createdAt, nextMessage.createdAt) > MAX_GROUP_GAP_MS;

  if (isTop && isBottom) return "single";
  if (isTop) return "top";
  if (isBottom) return "bottom";
  return "middle";
}

function timeDiff(a: string, b: string): number {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime());
}
