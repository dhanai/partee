import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
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

export async function POST(req: Request) {
  try {
    const user = await requireDbUser(req);
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Image file is required." }, { status: 400 });
    }

    if (!Object.keys(MIME_EXTENSION).includes(file.type)) {
      return NextResponse.json(
        { error: "Only JPG, PNG, WEBP, and GIF are supported." },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Image must be 5MB or smaller." },
        { status: 400 },
      );
    }

    const extension = MIME_EXTENSION[file.type];
    const fileName = `event-${user.id}-${Date.now()}-${randomUUID()}.${extension}`;
    const relativePath = `uploads/events/${fileName}`;
    const publicUrl = `/${relativePath}`;
    const diskPath = path.join(process.cwd(), "public", relativePath);

    await mkdir(path.dirname(diskPath), { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(diskPath, buffer);

    return NextResponse.json({ url: publicUrl });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to upload image." },
      { status: 500 },
    );
  }
}
