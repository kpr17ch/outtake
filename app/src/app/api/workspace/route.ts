import { readdir, stat, mkdir } from "fs/promises";
import { resolve, join, extname } from "path";

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

export async function GET() {
  try {
    await mkdir(RAW_DIR, { recursive: true });

    const entries = await readdir(RAW_DIR);
    const files = [];

    for (const name of entries) {
      if (name.startsWith(".")) continue;
      try {
        const filePath = join(RAW_DIR, name);
        const info = await stat(filePath);
        if (!info.isFile()) continue;

        files.push({
          name,
          size: info.size,
          type: getMimeType(name),
          modified: info.mtime.toISOString(),
        });
      } catch {
        // skip unreadable files
      }
    }

    // Sort by modified date, newest first
    files.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());

    return Response.json({ files });
  } catch (err) {
    console.error("[workspace] error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to list files" },
      { status: 500 }
    );
  }
}
