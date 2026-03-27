export type ImageAttachment = { type: "image"; url: string };

// Future attachment types:
// export type RoundPreviewAttachment = { type: "round_preview"; roundToken: string };
// export type PostAttachment = { type: "post"; postId: string };
// export type PollAttachment = { type: "poll"; question: string; options: string[] };

export type MessageAttachment = ImageAttachment;

export function getImageUrls(
  attachments: MessageAttachment[] | null | undefined,
): string[] {
  if (!attachments) return [];
  return attachments
    .filter((a): a is ImageAttachment => a.type === "image")
    .map((a) => a.url);
}

export function imageAttachments(urls: string[]): ImageAttachment[] {
  return urls.map((url) => ({ type: "image", url }));
}
