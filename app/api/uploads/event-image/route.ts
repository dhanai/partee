import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireDbUser } from "@/lib/auth";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MIME_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function withCors(request: Request, response: NextResponse): NextResponse {
  const origin = request.headers.get("origin");
  if (origin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.append("Vary", "Origin");
  }
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  return response;
}

function resolvedMimeType(blob: Blob, nameHint: string): string {
  const t = (blob.type ?? "").toLowerCase().trim();
  if (t === "image/jpg") return "image/jpeg";
  if (t && MIME_EXTENSION[t]) return t;
  const n = nameHint.toLowerCase();
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".gif")) return "image/gif";
  return t;
}

/** RN FormData often sends a Blob that is not `instanceof File` on the server. */
function getFilePart(formData: FormData): { blob: Blob; nameHint: string } | null {
  const entry = formData.get("file");
  if (entry == null || typeof entry === "string") {
    return null;
  }
  if (typeof Blob !== "undefined" && entry instanceof Blob) {
    const nameHint =
      typeof File !== "undefined" && entry instanceof File && entry.name
        ? entry.name
        : "profile-image.jpg";
    return { blob: entry, nameHint };
  }
  return null;
}

export async function OPTIONS(request: Request) {
  return withCors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(req: Request) {
  try {
    const user = await requireDbUser(req);
    const formData = (await req.formData()) as unknown as globalThis.FormData;
    const part = getFilePart(formData);

    if (!part) {
      return withCors(
        req,
        NextResponse.json({ error: "Image file is required." }, { status: 400 }),
      );
    }

    const { blob, nameHint } = part;
    const mime = resolvedMimeType(blob, nameHint);
    if (!Object.keys(MIME_EXTENSION).includes(mime)) {
      return withCors(
        req,
        NextResponse.json(
          { error: "Only JPG, PNG, WEBP, and GIF are supported." },
          { status: 400 },
        ),
      );
    }

    if (blob.size > MAX_FILE_SIZE) {
      return withCors(
        req,
        NextResponse.json(
          { error: "Image must be 5MB or smaller." },
          { status: 400 },
        ),
      );
    }

    const extension = MIME_EXTENSION[mime];
    const fileName = `event-${user.id}-${Date.now()}-${randomUUID()}.${extension}`;
    const relativePath = `uploads/events/${fileName}`;

    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    const onVercel = process.env.VERCEL === "1";

    if (blobToken) {
      const uploaded = await put(relativePath, blob, {
        access: "public",
        token: blobToken,
        addRandomSuffix: false,
        contentType: mime,
      });
      return withCors(req, NextResponse.json({ url: uploaded.url }));
    }

    if (onVercel) {
      return withCors(
        req,
        NextResponse.json(
          {
            error:
              "Image upload is not configured for this server. In Vercel: Storage → Blob → create a store and link it to this project (sets BLOB_READ_WRITE_TOKEN), then redeploy.",
          },
          { status: 503 },
        ),
      );
    }

    const publicUrl = `/${relativePath}`;
    const diskPath = path.join(process.cwd(), "public", relativePath);

    await mkdir(path.dirname(diskPath), { recursive: true });
    const buffer = Buffer.from(await blob.arrayBuffer());
    await writeFile(diskPath, buffer);

    return withCors(req, NextResponse.json({ url: publicUrl }));
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return withCors(req, NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    console.error("[event-image upload]", error);
    return withCors(
      req,
      NextResponse.json(
        { error: "Failed to upload image." },
        { status: 500 },
      ),
    );
  }
}
