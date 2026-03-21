import { stat, open, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { spawn } from "child_process";
import { join, dirname, basename } from "path";
import { resolveWorkspaceContext } from "@/lib/workspace-context";
import { resolveWorkspaceEntryPath, getMimeType } from "@/lib/workspace-server";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Serves video files with automatic transcoding for browser compatibility.
 * Creates a browser-friendly proxy (H.264 baseline/main, yuv420p, AAC audio)
 * in workspace/.proxy/ and serves that. Proxies are cached.
 */

interface ProbeResult {
  needsVideoTranscode: boolean;
  needsAudioTranscode: boolean;
  width: number;
  height: number;
}

async function probeFile(filePath: string): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const proc = spawn("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_streams",
      filePath,
    ]);
    let out = "";
    proc.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    proc.on("close", () => {
      try {
        const data = JSON.parse(out);
        const streams = data.streams || [];

        let needsVideoTranscode = false;
        let needsAudioTranscode = false;
        let width = 1920;
        let height = 1080;

        for (const s of streams) {
          if (s.codec_type === "video") {
            width = s.width || 1920;
            height = s.height || 1080;
            const pixFmt = (s.pix_fmt || "").toLowerCase();
            const profile = (s.profile || "").toLowerCase();

            // Browser can't play: 10-bit, 4:2:2, High 4:2:2, etc.
            if (
              pixFmt.includes("10") ||
              pixFmt.includes("422") ||
              pixFmt.includes("444") ||
              profile.includes("4:2:2") ||
              profile.includes("4:4:4") ||
              profile.includes("high 10") ||
              width > 1920 || height > 1920  // Downscale 4K for preview
            ) {
              needsVideoTranscode = true;
            }
          }
          if (s.codec_type === "audio") {
            const codec = (s.codec_name || "").toLowerCase();
            const compatible = ["aac", "mp3", "opus", "vorbis"];
            if (!compatible.includes(codec)) {
              needsAudioTranscode = true;
            }
          }
        }

        resolve({ needsVideoTranscode, needsAudioTranscode, width, height });
      } catch {
        resolve({ needsVideoTranscode: false, needsAudioTranscode: false, width: 1920, height: 1080 });
      }
    });
    proc.on("error", () => {
      resolve({ needsVideoTranscode: false, needsAudioTranscode: false, width: 1920, height: 1080 });
    });
  });
}

async function createProxy(srcPath: string, proxyPath: string, probe: ProbeResult): Promise<void> {
  await mkdir(dirname(proxyPath), { recursive: true });

  const args = ["-y", "-i", srcPath];

  if (probe.needsVideoTranscode) {
    // Scale down to max 1080p, convert to yuv420p for browser
    const maxDim = 1080;
    let scaleFilter: string;
    if (probe.width > probe.height) {
      // Landscape or square
      scaleFilter = `scale='min(${maxDim},iw):-2'`;
    } else {
      // Portrait (like reels)
      scaleFilter = `scale='-2:min(${maxDim},ih)'`;
    }
    args.push(
      "-vf", scaleFilter,
      "-c:v", "libx264",
      "-profile:v", "main",
      "-pix_fmt", "yuv420p",
      "-preset", "fast",
      "-crf", "23",
    );
  } else {
    args.push("-c:v", "copy");
  }

  if (probe.needsAudioTranscode) {
    args.push("-c:a", "aac", "-b:a", "192k");
  } else {
    args.push("-c:a", "copy");
  }

  // Drop data streams (timecodes etc.)
  args.push("-map", "0:v:0", "-map", "0:a:0?", "-movflags", "+faststart", proxyPath);

  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-200)}`));
    });
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

  // Check original exists
  try {
    await stat(fullPath);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  let servePath = fullPath;

  // For video files, check if proxy is needed
  const ext = basename(fullPath).split(".").pop()?.toLowerCase() || "";
  if (["mp4", "mov", "mkv", "avi", "webm"].includes(ext)) {
    try {
      const probe = await probeFile(fullPath);

      if (probe.needsVideoTranscode || probe.needsAudioTranscode) {
        const proxyDir = join(workspace!.workspacePath, ".proxy");
        const stem = basename(fullPath).replace(/\.[^.]+$/, "");
        const proxyFile = join(proxyDir, `${stem}_proxy.mp4`);

        if (!existsSync(proxyFile)) {
          console.log(`[proxy] Transcoding ${basename(fullPath)} → proxy (video=${probe.needsVideoTranscode}, audio=${probe.needsAudioTranscode})`);
          await createProxy(fullPath, proxyFile, probe);
          console.log(`[proxy] Done: ${proxyFile}`);
        }
        servePath = proxyFile;
      }
    } catch (err) {
      console.error("[proxy] Transcode failed, serving original:", err);
    }
  }

  // Serve the file (original or proxy)
  const fileStat = await stat(servePath);
  const mimeType = getMimeType(servePath);
  const fileSize = fileStat.size;
  const rangeHeader = request.headers.get("range");

  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (!match) return new Response("Invalid range", { status: 416 });

    const start = parseInt(match[1], 10);
    const end = match[2] ? parseInt(match[2], 10) : Math.min(start + 5 * 1024 * 1024, fileSize - 1);

    if (start >= fileSize || start > end) {
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
        "Content-Type": "video/mp4",
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Content-Length": String(chunkSize),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  // Full file
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
      "Content-Type": "video/mp4",
      "Content-Length": String(fileSize),
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
