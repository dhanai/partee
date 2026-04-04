import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { conversations, messages, messageReactions, rounds, users } from "@/db/schema";
import { type MessageAttachment, getGifUrls, getImageUrls } from "@/lib/attachment-types";
import {
  publishChatRoomMessage,
  publishConversationInboxToasts,
  publishConversationMessageMutation,
} from "@/lib/conversation-ably";
import { notifyConversationMessage } from "@/lib/notify-user";
import { publishAfterRoundDetailChanged } from "@/lib/parfade-ably-publish";

export const MAX_BODY = 2000;
export const PAGE_SIZE = 50;

export const VALID_EMOJIS = ["heart", "laugh", "shocked", "cry", "angry", "thumbs_up", "thumbs_down"] as const;

const imageAttachmentSchema = z.object({
  type: z.literal("image"),
  url: z.string().url(),
});

const gifAttachmentSchema = z.object({
  type: z.literal("gif"),
  url: z.string().url(),
  giphyId: z.string().optional(),
});

const attachmentSchema = z.discriminatedUnion("type", [
  imageAttachmentSchema,
  gifAttachmentSchema,
]);

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

export const messagePatchSchema = z.object({
  body: z.string().trim().min(1, "Message cannot be empty.").max(MAX_BODY, `Message must be ${MAX_BODY} characters or fewer.`),
});

export type MappedMessage = {
  id: string;
  body: string | null;
  attachments?: MessageAttachment[] | null;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  isMine: boolean;
  parentId?: string | null;
  parentPreview?: { body: string; senderName: string } | null;
  user: { id: string; name: string; avatar: string | null };
  reactions: Record<string, { count: number; userIds: string[] }>;
};

/** Max age (ms) after which a message can no longer be edited. */
export const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;

type MessageRow = {
  id: string;
  body: string | null;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  userId: string | null;
  userName: string | null;
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
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    isMine: row.userId != null && row.userId === viewerId,
    parentId: row.parentId ?? null,
    user: {
      id: row.userId ?? "deleted",
      name: row.userName ?? "Deleted User",
      avatar: row.userId != null ? row.userAvatar : null,
    },
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
    .select({
      id: messages.id,
      body: messages.body,
      userName: users.name,
      deletedAt: messages.deletedAt,
    })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.userId))
    .where(sql`${messages.id} IN (${sql.join(parentIds.map((id) => sql`${id}`), sql`, `)})`);
  return new Map(
    rows.map((p) => [
      p.id,
      {
        body: p.deletedAt ? "(Original message removed)" : p.body ?? "",
        userName: p.userName ?? "Deleted User",
      },
    ]),
  );
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
        editedAt: messages.editedAt,
        deletedAt: messages.deletedAt,
        userId: messages.userId,
        userName: users.name,
        userAvatar: users.avatar,
      })
      .from(messages)
      .leftJoin(users, eq(users.id, messages.userId))
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
      editedAt: messages.editedAt,
      deletedAt: messages.deletedAt,
      userId: messages.userId,
      userName: users.name,
      userAvatar: users.avatar,
    })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.userId))
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
  const gifCount = getGifUrls(input.attachments).length;
  const pushBody = input.body
    ? input.body
    : imageCount === 0 && gifCount === 0
      ? ""
      : gifCount === 0
        ? imageCount === 1
          ? "Sent a photo"
          : `Sent ${imageCount} photos`
        : imageCount === 0
          ? gifCount === 1
            ? "Sent a GIF"
            : `Sent ${gifCount} GIFs`
          : "Sent photos and GIFs";

  let parentPreview: MappedMessage["parentPreview"] = null;
  if (inserted.parentId) {
    const [parent] = await db
      .select({
        body: messages.body,
        userName: users.name,
        deletedAt: messages.deletedAt,
      })
      .from(messages)
      .leftJoin(users, eq(users.id, messages.userId))
      .where(eq(messages.id, inserted.parentId))
      .limit(1);
    if (parent) {
      parentPreview = {
        body: parent.deletedAt
          ? "(Original message removed)"
          : truncatePreview(parent.body ?? ""),
        senderName: parent.userName ?? "Deleted User",
      };
    }
  }

  const mappedMessage: MappedMessage = {
    id: inserted.id,
    body: inserted.body,
    attachments: (inserted.attachments as MessageAttachment[] | null) ?? null,
    createdAt: inserted.createdAt.toISOString(),
    editedAt: null,
    deletedAt: null,
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

  // If conversation is linked to a round, update the round detail live preview
  try {
    const [conv] = await db
      .select({ roundId: conversations.roundId })
      .from(conversations)
      .where(eq(conversations.id, input.conversationId))
      .limit(1);
    if (conv?.roundId) {
      const [round] = await db
        .select({ inviteToken: rounds.inviteToken })
        .from(rounds)
        .where(eq(rounds.id, conv.roundId))
        .limit(1);
      if (round?.inviteToken) {
        await publishAfterRoundDetailChanged(round.inviteToken, "chat");
      }
    }
  } catch (err) {
    console.error("[sendConversationMessage] round-detail-refresh", err);
  }

  return mappedMessage;
}

async function loadMappedMessageWithExtras(
  messageId: string,
  conversationId: string,
  viewerId: string,
): Promise<MappedMessage | null> {
  const [row] = await db
    .select({
      id: messages.id,
      body: messages.body,
      parentId: messages.parentId,
      attachments: messages.attachments,
      createdAt: messages.createdAt,
      editedAt: messages.editedAt,
      deletedAt: messages.deletedAt,
      userId: messages.userId,
      userName: users.name,
      userAvatar: users.avatar,
    })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.userId))
    .where(and(eq(messages.id, messageId), eq(messages.conversationId, conversationId)))
    .limit(1);

  if (!row) return null;

  const mapped = mapRow(row, viewerId);
  const parentIds = mapped.parentId ? [mapped.parentId] : [];
  const [reactionsMap, parentMap] = await Promise.all([
    fetchReactions([messageId]),
    parentIds.length ? fetchParentPreviews(parentIds) : Promise.resolve(new Map()),
  ]);
  return attachExtras([mapped], reactionsMap, parentMap)[0] ?? null;
}

export async function editConversationMessage(input: {
  conversationId: string;
  messageId: string;
  viewerId: string;
  body: string;
}): Promise<MappedMessage> {
  const [row] = await db
    .select({
      id: messages.id,
      userId: messages.userId,
      createdAt: messages.createdAt,
      deletedAt: messages.deletedAt,
    })
    .from(messages)
    .where(and(eq(messages.id, input.messageId), eq(messages.conversationId, input.conversationId)))
    .limit(1);

  if (!row) throw new Error("NOT_FOUND");
  if (row.userId !== input.viewerId) throw new Error("FORBIDDEN");
  if (row.deletedAt) throw new Error("DELETED");

  const age = Date.now() - row.createdAt.getTime();
  if (age > MESSAGE_EDIT_WINDOW_MS) throw new Error("EDIT_EXPIRED");

  await db
    .update(messages)
    .set({ body: input.body, editedAt: new Date() })
    .where(eq(messages.id, input.messageId));

  const full = await loadMappedMessageWithExtras(input.messageId, input.conversationId, input.viewerId);
  if (!full) throw new Error("NOT_FOUND");

  await publishConversationMessageMutation({
    conversationId: input.conversationId,
    mutation: "edit",
    message: full,
  }).catch((err) => console.error("[editConversationMessage] mutation pub", err));

  return full;
}

export async function unsendConversationMessage(input: {
  conversationId: string;
  messageId: string;
  viewerId: string;
}): Promise<MappedMessage> {
  const [row] = await db
    .select({
      id: messages.id,
      userId: messages.userId,
      deletedAt: messages.deletedAt,
    })
    .from(messages)
    .where(and(eq(messages.id, input.messageId), eq(messages.conversationId, input.conversationId)))
    .limit(1);

  if (!row) throw new Error("NOT_FOUND");
  if (row.userId !== input.viewerId) throw new Error("FORBIDDEN");
  if (row.deletedAt) throw new Error("ALREADY_DELETED");

  await db
    .update(messages)
    .set({
      body: null,
      attachments: null,
      deletedAt: new Date(),
    })
    .where(eq(messages.id, input.messageId));

  const full = await loadMappedMessageWithExtras(input.messageId, input.conversationId, input.viewerId);
  if (!full) throw new Error("NOT_FOUND");

  await publishConversationMessageMutation({
    conversationId: input.conversationId,
    mutation: "delete",
    message: full,
  }).catch((err) => console.error("[unsendConversationMessage] mutation pub", err));

  return full;
}
