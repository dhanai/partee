import { Platform } from "react-native";
import { apiBaseUrl } from "./api";
import {
  compressImageToJpegUriForUpload,
  compressImageToMaxBytes,
} from "./compress-image-for-upload";

export const AVATAR_MAX_BYTES = 512 * 1024;
export const COVER_MAX_BYTES = 1.5 * 1024 * 1024;
export const POST_MAX_BYTES = 1.5 * 1024 * 1024;

/**
 * Compress, build FormData, and upload an image to /api/uploads/event-image.
 * Returns the uploaded image URL on success, throws on failure.
 */
export async function uploadImage(opts: {
  uri: string;
  filename: string;
  maxBytes: number;
  getToken: () => Promise<string | null>;
  width?: number;
  height?: number;
}): Promise<string> {
  const { uri, filename, maxBytes, getToken, width, height } = opts;
  const token = await getToken();
  const formData = new FormData();

  if (Platform.OS === "web") {
    const imageBlob = await compressImageToMaxBytes(uri, maxBytes, width, height);
    if (imageBlob.size > maxBytes) {
      throw new Error("Could not reduce photo to an acceptable size. Try a different image.");
    }
    formData.append("file", imageBlob, filename);
  } else {
    const fileUri = await compressImageToJpegUriForUpload(uri, maxBytes, width, height);
    formData.append("file", {
      uri: fileUri,
      name: filename,
      type: "image/jpeg",
    } as unknown as Blob);
  }

  const response = await fetch(`${apiBaseUrl}/api/uploads/event-image`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });

  const json = (await response.json()) as { url?: string; error?: string };
  if (!response.ok || !json.url) {
    throw new Error(json.error ?? `Image upload failed (${response.status}).`);
  }
  return json.url;
}
