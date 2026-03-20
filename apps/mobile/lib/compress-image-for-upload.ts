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
 * JPEG re-encode with resize + quality steps until the file is under maxBytes (or limits hit).
 * Image manipulator is loaded on demand so the app can boot even if the dev client was built
 * before this native module was added (rebuild with `npx expo run:ios` to enable compression).
 */
export async function compressImageToMaxBytes(
  uri: string,
  maxBytes: number,
  naturalWidth?: number,
  naturalHeight?: number,
): Promise<Blob> {
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
  let quality = 0.9;
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
      return blob;
    }
    if (quality > 0.38) {
      quality = Math.max(0.25, quality - 0.09);
    } else {
      targetWidth = Math.max(240, Math.round(targetWidth * 0.82));
    }
  }

  return ensureJpegBlob(await (await fetch(currentUri)).blob());
}
