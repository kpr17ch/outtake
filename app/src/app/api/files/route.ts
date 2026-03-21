import { readFile, stat } from "fs/promises";
import { resolve, join, extname } from "path";
import { type NextRequest } from "next/server";

export const runtime = "nodejs";

const RAW_DIR = resolve(process.cwd(), "../workspace/raw");

const MIME_MAP: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".tiff": "image/tiff",
  ".tif": "image/tiff",
};

function getMimeType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  return MIME_MAP[ext] || "application/octet-stream";
}

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name");
  if (!name) {
    return new Response("Missing name parameter", { status: 400 });
  }

  // Prevent directory traversal
  const safeName = name.replace(/[/\\]/g, "");
  const filePath = join(RAW_DIR, safeName);

  // Ensure path stays inside RAW_DIR
  if (!filePath.startsWith(RAW_DIR)) {
    return new Response("Invalid path", { status: 400 });
  }

  try {
    const info = await stat(filePath);
    const buffer = await readFile(filePath);
    const mimeType = getMimeType(safeName);

    return new Response(buffer, {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(info.size),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response("File not found", { status: 404 });
  }
}
