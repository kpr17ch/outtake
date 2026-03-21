import { stat, open, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { spawn } from "child_process";
import { join, dirname, basename } from "path";
import { resolveWorkspaceContext } from "@/lib/workspace-context";
import { resolveWorkspaceEntryPath, getMimeType } from "@/lib/workspace-server";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Serves video files with automatic transcoding for browser compatibility.
 * If the original file has incompatible codecs (e.g., pcm_s16be audio),
 * creates a browser-friendly proxy in workspace/.proxy/ and serves that instead.
 */

async function needsProxy(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("ffprobe", [
      "-v", "quiet",
      "-select_streams", "a:0",
      "-show_entries", "stream=codec_name",
      "-of", "csv=p=0",
      filePath,
    ]);
    let out = "";
    proc.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    proc.on("close", () => {
      const codec = out.trim().toLowerCase();
      // Browser-compatible audio codecs
      const compatible = ["aac", "mp3", "opus", "vorbis", "flac", ""];
      resolve(!compatible.includes(codec));
    });
    proc.on("error", () => resolve(false));
  });
}

async function createProxy(srcPath: string, proxyPath: string): Promise<void> {
  await mkdir(dirname(proxyPath), { recursive: true });
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-y", "-i", srcPath,
      "-c:v", "copy",       // Keep video as-is (fast)
      "-c:a", "aac",        // Transcode audio to AAC
      "-b:a", "192k",
      "-movflags", "+faststart",
      proxyPath,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)));
    proc.on("error", reject);
  });
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await ctx.params;
  const relativePath = segments.join("/");
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");
  const workspace = await resolveWorkspaceContext(sessionId);

  if (sessionId && !workspace) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const fullPath = resolveWorkspaceEntryPath(workspace!.workspacePath, relativePath);
  if (!fullPath) return new Response("Forbidden", { status: 403 });

  let servePath = fullPath;

  // Check if we need a proxy for browser compatibility
  const ext = basename(fullPath).split(".").pop()?.toLowerCase() || "";
  if (["mp4", "mov", "mkv", "avi"].includes(ext)) {
    try {
      if (await needsProxy(fullPath)) {
        const proxyDir = join(workspace!.workspacePath, ".proxy");
        const proxyFile = join(proxyDir, basename(fullPath, `.${ext}`) + "_proxy.mp4");

        if (!existsSync(proxyFile)) {
          await createProxy(fullPath, proxyFile);
        }
        servePath = proxyFile;
      }
    } catch {
      // Fall through to serve original
    }
  }

  let fileStat;
  try {
    fileStat = await stat(servePath);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const mimeType = getMimeType(servePath);
  const fileSize = fileStat.size;
  const rangeHeader = request.headers.get("range");

  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (!match) return new Response("Invalid range", { status: 416 });

    const start = parseInt(match[1], 10);
    const end = match[2] ? parseInt(match[2], 10) : Math.min(start + 5 * 1024 * 1024, fileSize - 1);

    if (start >= fileSize || end >= fileSize || start > end) {
      return new Response("Range not satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${fileSize}` },
      });
    }

    const chunkSize = end - start + 1;
    const fh = await open(servePath, "r");
    const stream = fh.createReadStream({ start, end, autoClose: true });

    const readable = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk: Buffer | string) => {
          controller.enqueue(new Uint8Array(typeof chunk === "string" ? Buffer.from(chunk) : chunk));
        });
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
      },
      cancel() { stream.destroy(); },
    });

    return new Response(readable, {
      status: 206,
      headers: {
        "Content-Type": mimeType,
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Content-Length": String(chunkSize),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  // Full file — stream it
  const fh = await open(servePath, "r");
  const stream = fh.createReadStream({ autoClose: true });

  const readable = new ReadableStream({
    start(controller) {
      stream.on("data", (chunk: Buffer | string) => {
        controller.enqueue(new Uint8Array(typeof chunk === "string" ? Buffer.from(chunk) : chunk));
      });
      stream.on("end", () => controller.close());
      stream.on("error", (err) => controller.error(err));
    },
    cancel() { stream.destroy(); },
  });

  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(fileSize),
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
