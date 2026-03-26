const DEFAULT_MAX_LONG_EDGE = 2048;

/** RN / Expo often yield blobs with empty or generic MIME; we always output JPEG from the manipulator. */
async function ensureJpegBlob(blob: Blob): Promise<Blob> {
  const t = (blob.type ?? "").toLowerCase();
  if (t === "image/jpeg" || t === "image/jpg") {
    return blob;
  }
  return new Blob([await blob.arrayBuffer()], { type: "image/jpeg" });
}

/**
 * Returns a `file://` JPEG URI under maxBytes (same logic for native FormData `{ uri, name, type }`).
 */
export async function compressImageToJpegUriForUpload(
  uri: string,
  maxBytes: number,
  naturalWidth?: number,
  naturalHeight?: number,
): Promise<string> {
  const ImageManipulator = await import("expo-image-manipulator");

  let targetWidth =
    naturalWidth && naturalHeight
      ? Math.max(
          1,
          Math.round(
            naturalWidth * Math.min(1, DEFAULT_MAX_LONG_EDGE / Math.max(naturalWidth, naturalHeight)),
          ),
        )
      : DEFAULT_MAX_LONG_EDGE;
  let quality = 0.8;
  let currentUri = uri;

  for (let attempt = 0; attempt < 18; attempt++) {
    const { uri: nextUri } = await ImageManipulator.manipulateAsync(
      currentUri,
      [{ resize: { width: Math.max(240, targetWidth) } }],
      {
        compress: quality,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    );
    currentUri = nextUri;
    const blob = await ensureJpegBlob(await (await fetch(currentUri)).blob());
    if (blob.size <= maxBytes) {
      return currentUri;
    }
    if (quality > 0.38) {
      quality = Math.max(0.25, quality - 0.09);
    } else {
      targetWidth = Math.max(240, Math.round(targetWidth * 0.82));
    }
  }

  return currentUri;
}

/**
 * JPEG re-encode with resize + quality steps until the file is under maxBytes (or limits hit).
 * Prefer {@link compressImageToJpegUriForUpload} + native FormData `uri` on iOS/Android — Hermes
 * often mishandles `Blob` in multipart bodies.
 */
export async function compressImageToMaxBytes(
  uri: string,
  maxBytes: number,
  naturalWidth?: number,
  naturalHeight?: number,
): Promise<Blob> {
  const fileUri = await compressImageToJpegUriForUpload(
    uri,
    maxBytes,
    naturalWidth,
    naturalHeight,
  );
  return ensureJpegBlob(await (await fetch(fileUri)).blob());
}
