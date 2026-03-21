import { resolve, normalize } from "path";
import { stat, open } from "fs/promises";

export const runtime = "nodejs";

const WORKSPACE = resolve(process.cwd(), "../workspace");

const MIME_TYPES: Record<string, string> = {
  // Video
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  // Audio
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  // Image
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  // Text / JSON
  ".json": "application/json",
  ".txt": "text/plain",
  ".srt": "text/plain",
  ".md": "text/plain",
};

function getMimeType(filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await ctx.params;
  const relativePath = segments.join("/");

  // Security: normalize and ensure path stays within workspace
  const fullPath = normalize(resolve(WORKSPACE, relativePath));
  if (!fullPath.startsWith(WORKSPACE)) {
    return new Response("Forbidden", { status: 403 });
  }

  let fileStat;
  try {
    fileStat = await stat(fullPath);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  if (!fileStat.isFile()) {
    return new Response("Not a file", { status: 400 });
  }

  const mimeType = getMimeType(fullPath);
  const fileSize = fileStat.size;
  const rangeHeader = request.headers.get("range");

  // Range request support for video/audio seeking
  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (!match) {
      return new Response("Invalid range", { status: 416 });
    }

    const start = parseInt(match[1], 10);
    const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize || start > end) {
      return new Response("Range not satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${fileSize}` },
      });
    }

    const chunkSize = end - start + 1;
    const fh = await open(fullPath, "r");
    const stream = fh.createReadStream({ start, end, autoClose: true });

    // Convert Node stream to web ReadableStream
    const readable = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk: Buffer | string) => {
          const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
          controller.enqueue(new Uint8Array(buf));
        });
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
      },
      cancel() {
        stream.destroy();
      },
    });

    return new Response(readable, {
      status: 206,
      headers: {
        "Content-Type": mimeType,
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Content-Length": String(chunkSize),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-cache",
      },
    });
  }

  // Full file response — stream it
  const fh = await open(fullPath, "r");
  const stream = fh.createReadStream({ autoClose: true });

  const readable = new ReadableStream({
    start(controller) {
      stream.on("data", (chunk: Buffer | string) => {
        const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
        controller.enqueue(new Uint8Array(buf));
      });
      stream.on("end", () => controller.close());
      stream.on("error", (err) => controller.error(err));
    },
    cancel() {
      stream.destroy();
    },
  });

  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(fileSize),
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-cache",
    },
  });
}
