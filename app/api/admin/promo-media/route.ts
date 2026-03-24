import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireDbUser } from "@/lib/auth";
import { isUserAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";

const MAX_IMAGE = 8 * 1024 * 1024;
const MAX_VIDEO = 45 * 1024 * 1024;

const IMAGE_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const VIDEO_MIME: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

function getFilePart(formData: FormData): { blob: Blob; nameHint: string } | null {
  const entry = formData.get("file");
  if (entry == null || typeof entry === "string") return null;
  if (typeof Blob !== "undefined" && entry instanceof Blob) {
    const nameHint =
      typeof File !== "undefined" && entry instanceof File && entry.name
        ? entry.name
        : "upload.bin";
    return { blob: entry, nameHint };
  }
  return null;
}

function resolvedMime(blob: Blob, nameHint: string): string {
  const t = (blob.type ?? "").toLowerCase().trim();
  if (t === "image/jpg") return "image/jpeg";
  if (t && (IMAGE_MIME[t] || VIDEO_MIME[t])) return t;
  const n = nameHint.toLowerCase();
  if (n.endsWith(".mp4")) return "video/mp4";
  if (n.endsWith(".mov")) return "video/quicktime";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".gif")) return "image/gif";
  return t;
}

export async function POST(req: Request) {
  try {
    const user = await requireDbUser(req);
    if (!isUserAdmin(user)) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const formData = (await req.formData()) as unknown as globalThis.FormData;
    const part = getFilePart(formData);
    if (!part) {
      return NextResponse.json({ error: "file is required." }, { status: 400 });
    }

    const mime = resolvedMime(part.blob, part.nameHint);
    const isImage = Boolean(IMAGE_MIME[mime]);
    const isVideo = Boolean(VIDEO_MIME[mime]);
    if (!isImage && !isVideo) {
      return NextResponse.json(
        { error: "Use JPG, PNG, WEBP, GIF, MP4, or MOV." },
        { status: 400 },
      );
    }
    const max = isVideo ? MAX_VIDEO : MAX_IMAGE;
    if (part.blob.size > max) {
      return NextResponse.json(
        { error: isVideo ? "Video must be 45MB or smaller." : "Image must be 8MB or smaller." },
        { status: 400 },
      );
    }

    const ext = isImage ? IMAGE_MIME[mime] : VIDEO_MIME[mime];
    const fileName = `promo-${user.id}-${Date.now()}-${randomUUID()}.${ext}`;
    const relativePath = `uploads/promos/${fileName}`;
    const mediaKind = isVideo ? "video" : "image";

    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    const onVercel = process.env.VERCEL === "1";

    if (blobToken) {
      const uploaded = await put(relativePath, part.blob, {
        access: "public",
        token: blobToken,
        addRandomSuffix: false,
        contentType: mime,
      });
      return NextResponse.json({ url: uploaded.url, mediaKind });
    }

    if (onVercel) {
      return NextResponse.json(
        {
          error:
            "Blob storage is not configured. Add BLOB_READ_WRITE_TOKEN (Vercel Blob) and redeploy.",
        },
        { status: 503 },
      );
    }

    const publicUrl = `/${relativePath}`;
    const diskPath = path.join(process.cwd(), "public", relativePath);
    await mkdir(path.dirname(diskPath), { recursive: true });
    const buffer = Buffer.from(await part.blob.arrayBuffer());
    await writeFile(diskPath, buffer);

    return NextResponse.json({ url: publicUrl, mediaKind });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST /api/admin/promo-media]", error);
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }
}
