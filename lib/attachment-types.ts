export type ImageAttachment = { type: "image"; url: string };

export type GifAttachment = { type: "gif"; url: string; giphyId?: string };

// Future attachment types:
// export type RoundPreviewAttachment = { type: "round_preview"; roundToken: string };
// export type PostAttachment = { type: "post"; announcementId: string };
// export type PollAttachment = { type: "poll"; question: string; options: string[] };

export type MessageAttachment = ImageAttachment | GifAttachment;

export function getImageUrls(
  attachments: MessageAttachment[] | null | undefined,
): string[] {
  if (!attachments) return [];
  return attachments
    .filter((a): a is ImageAttachment => a.type === "image")
    .map((a) => a.url);
}

export function getGifUrls(
  attachments: MessageAttachment[] | null | undefined,
): string[] {
  if (!attachments) return [];
  return attachments
    .filter((a): a is GifAttachment => a.type === "gif")
    .map((a) => a.url);
}

/** URLs for image + gif attachments, in order (for chat bubbles / mosaics). */
export function getMediaUrls(
  attachments: MessageAttachment[] | null | undefined,
): string[] {
  if (!attachments) return [];
  return attachments
    .filter(
      (a): a is ImageAttachment | GifAttachment =>
        a.type === "image" || a.type === "gif",
    )
    .map((a) => a.url);
}

export function imageAttachments(urls: string[]): ImageAttachment[] {
  return urls.map((url) => ({ type: "image", url }));
}
