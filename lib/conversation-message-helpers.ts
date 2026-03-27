import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { messages, messageReactions, users } from "@/db/schema";
import { type MessageAttachment, getImageUrls } from "@/lib/attachment-types";
import { publishChatRoomMessage, publishConversationInboxToasts } from "@/lib/conversation-ably";
import { notifyConversationMessage } from "@/lib/notify-user";

export const MAX_BODY = 2000;
export const PAGE_SIZE = 50;

export const VALID_EMOJIS = ["heart", "laugh", "shocked", "cry", "angry", "thumbs_up", "thumbs_down"] as const;

const attachmentSchema = z.object({
  type: z.literal("image"),
  url: z.string().url(),
});

export const messagePostSchema = z
  .object({
    body: z.string().trim().max(MAX_BODY, `Message must be ${MAX_BODY} characters or fewer.`).optional(),
    parentId: z.string().uuid().optional(),
    attachments: z.array(attachmentSchema).max(5).optional(),
  })
  .refine((d) => (d.body && d.body.length > 0) || (d.attachments && d.attachments.length > 0), {
    message: "Message must have text or at least one attachment.",
  });

export const reactionPostSchema = z.object({
  emoji: z.enum(VALID_EMOJIS),
});

export type MappedMessage = {
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

type MessageRow = {
  id: string;
  body: string | null;
  createdAt: Date;
  userId: string;
  userName: string;
  userAvatar: string | null;
  parentId?: string | null;
  attachments?: unknown;
};

function mapRow(row: MessageRow, viewerId: string): MappedMessage {
  return {
    id: row.id,
    body: row.body,
    attachments: (row.attachments as MessageAttachment[] | null) ?? null,
    createdAt: row.createdAt.toISOString(),
    isMine: row.userId === viewerId,
    parentId: row.parentId ?? null,
    user: { id: row.userId, name: row.userName, avatar: row.userAvatar },
    reactions: {},
  };
}

function groupReactions(rows: Array<{ messageId: string; emoji: string; userId: string }>) {
  const map = new Map<string, Record<string, { count: number; userIds: string[] }>>();
  for (const r of rows) {
    let byMsg = map.get(r.messageId);
    if (!byMsg) {
      byMsg = {};
      map.set(r.messageId, byMsg);
    }
    const entry = byMsg[r.emoji] ?? { count: 0, userIds: [] };
    entry.count += 1;
    entry.userIds.push(r.userId);
    byMsg[r.emoji] = entry;
  }
  return map;
}

async function fetchReactions(messageIds: string[]) {
  if (messageIds.length === 0) return new Map<string, Record<string, { count: number; userIds: string[] }>>();
  const rows = await db
    .select({
      messageId: messageReactions.messageId,
      emoji: messageReactions.emoji,
      userId: messageReactions.userId,
    })
    .from(messageReactions)
    .where(sql`${messageReactions.messageId} IN (${sql.join(messageIds.map((id) => sql`${id}`), sql`, `)})`);
  return groupReactions(rows);
}

async function fetchParentPreviews(parentIds: string[]) {
  if (parentIds.length === 0) return new Map<string, { body: string; userName: string }>();
  const rows = await db
    .select({ id: messages.id, body: messages.body, userName: users.name })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.userId))
    .where(sql`${messages.id} IN (${sql.join(parentIds.map((id) => sql`${id}`), sql`, `)})`);
  return new Map(rows.map((p) => [p.id, { body: p.body ?? "", userName: p.userName }]));
}

function truncatePreview(body: string, max = 80): string {
  return body.length > max ? body.slice(0, max - 3) + "…" : body;
}

function attachExtras(
  mapped: MappedMessage[],
  reactionsMap: Map<string, Record<string, { count: number; userIds: string[] }>>,
  parentMap: Map<string, { body: string; userName: string }>,
): MappedMessage[] {
  return mapped.map((m) => {
    const reactions = reactionsMap.get(m.id) ?? {};
    const parent = m.parentId ? parentMap.get(m.parentId) : null;
    return {
      ...m,
      reactions,
      parentPreview: parent
        ? { body: truncatePreview(parent.body), senderName: parent.userName }
        : null,
    };
  });
}

/**
 * Fetch messages for a conversation with pagination, reactions, and parent previews.
 */
export async function getConversationMessages(
  conversationId: string,
  viewerId: string,
  options?: { before?: string; after?: string; limit?: number },
): Promise<{ messages: MappedMessage[]; hasMore: boolean }> {
  const limit = Math.max(1, Math.min(PAGE_SIZE, options?.limit ?? PAGE_SIZE));
  const cursor = options?.before ?? options?.after;
  const direction = options?.after ? "after" : "before";

  let whereClause = eq(messages.conversationId, conversationId);

  if (cursor) {
    const parsed = z.string().uuid().safeParse(cursor);
    if (!parsed.success) return { messages: [], hasMore: false };

    const [ref] = await db
      .select({ createdAt: messages.createdAt })
      .from(messages)
      .where(and(eq(messages.id, parsed.data), eq(messages.conversationId, conversationId)))
      .limit(1);

    if (!ref) return { messages: [], hasMore: false };

    whereClause = and(
      eq(messages.conversationId, conversationId),
      direction === "after"
        ? gt(messages.createdAt, ref.createdAt)
        : lt(messages.createdAt, ref.createdAt),
    )!;
  }

  if (direction === "after" && cursor) {
    const rows = await db
      .select({
        id: messages.id,
        body: messages.body,
        parentId: messages.parentId,
        attachments: messages.attachments,
        createdAt: messages.createdAt,
        userId: messages.userId,
        userName: users.name,
        userAvatar: users.avatar,
      })
      .from(messages)
      .innerJoin(users, eq(users.id, messages.userId))
      .where(whereClause)
      .orderBy(asc(messages.createdAt))
      .limit(limit);

    const mapped = rows.map((r) => mapRow(r, viewerId));
    const msgIds = mapped.map((m) => m.id);
    const parentIds = [...new Set(mapped.map((m) => m.parentId).filter((p): p is string => Boolean(p)))];

    const [reactionsMap, parentMap] = await Promise.all([
      fetchReactions(msgIds),
      fetchParentPreviews(parentIds),
    ]);

    return { messages: attachExtras(mapped, reactionsMap, parentMap), hasMore: false };
  }

  const rowsDesc = await db
    .select({
      id: messages.id,
      body: messages.body,
      parentId: messages.parentId,
      attachments: messages.attachments,
      createdAt: messages.createdAt,
      userId: messages.userId,
      userName: users.name,
      userAvatar: users.avatar,
    })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.userId))
    .where(whereClause)
    .orderBy(desc(messages.createdAt))
    .limit(limit + 1);

  const hasMore = rowsDesc.length > limit;
  const page = hasMore ? rowsDesc.slice(0, limit) : rowsDesc;
  const chronological = [...page].reverse();

  const mapped = chronological.map((r) => mapRow(r, viewerId));
  const msgIds = mapped.map((m) => m.id);
  const parentIds = [...new Set(mapped.map((m) => m.parentId).filter((p): p is string => Boolean(p)))];

  const [reactionsMap, parentMap] = await Promise.all([
    fetchReactions(msgIds),
    fetchParentPreviews(parentIds),
  ]);

  return { messages: attachExtras(mapped, reactionsMap, parentMap), hasMore };
}

/**
 * Insert a message and fire Ably + push notifications. Returns the mapped message.
 */
export async function sendConversationMessage(input: {
  conversationId: string;
  viewerId: string;
  viewerName: string;
  viewerAvatar: string | null;
  body: string | null;
  parentId: string | null;
  attachments: MessageAttachment[] | null;
}): Promise<MappedMessage> {
  const [inserted] = await db
    .insert(messages)
    .values({
      conversationId: input.conversationId,
      userId: input.viewerId,
      body: input.body,
      parentId: input.parentId,
      attachments: input.attachments,
    })
    .returning();

  if (!inserted) throw new Error("Failed to insert message.");

  const imageCount = getImageUrls(input.attachments).length;
  const pushBody = input.body
    ? input.body
    : imageCount === 1
      ? "Sent a photo"
      : imageCount > 1
        ? `Sent ${imageCount} photos`
        : "";

  let parentPreview: MappedMessage["parentPreview"] = null;
  if (inserted.parentId) {
    const [parent] = await db
      .select({ body: messages.body, userName: users.name })
      .from(messages)
      .innerJoin(users, eq(users.id, messages.userId))
      .where(eq(messages.id, inserted.parentId))
      .limit(1);
    if (parent) {
      parentPreview = {
        body: truncatePreview(parent.body ?? ""),
        senderName: parent.userName,
      };
    }
  }

  const mappedMessage: MappedMessage = {
    id: inserted.id,
    body: inserted.body,
    attachments: (inserted.attachments as MessageAttachment[] | null) ?? null,
    createdAt: inserted.createdAt.toISOString(),
    isMine: true,
    parentId: inserted.parentId,
    parentPreview,
    user: { id: input.viewerId, name: input.viewerName, avatar: input.viewerAvatar },
    reactions: {},
  };

  await Promise.all([
    publishChatRoomMessage(
      input.conversationId,
      mappedMessage,
    ).catch((err) => console.error("[sendConversationMessage] ably-chat", err)),

    publishConversationInboxToasts({
      conversationId: input.conversationId,
      senderId: input.viewerId,
      senderName: input.viewerName,
      senderAvatar: input.viewerAvatar,
      body: pushBody,
    }).catch((err) => console.error("[sendConversationMessage] inbox-toast", err)),

    notifyConversationMessage({
      conversationId: input.conversationId,
      senderUserId: input.viewerId,
      senderName: input.viewerName,
      messageBody: pushBody,
    }).catch((err) => console.error("[sendConversationMessage] push", err)),
  ]);

  return mappedMessage;
}
