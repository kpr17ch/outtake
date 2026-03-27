import { stat, open } from "fs/promises";
import { resolveWorkspaceContext } from "@/lib/workspace-context";
import {
  getMimeType,
  resolveWorkspaceEntryPath,
} from "@/lib/workspace-server";

export const runtime = "nodejs";

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
  if (!fullPath) {
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

export async function DELETE(
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
  if (!fullPath) {
    return new Response("Forbidden", { status: 403 });
  }
  if (!(relativePath.startsWith("input/") || relativePath.startsWith("output/"))) {
    return new Response("Only input/output files can be deleted", { status: 400 });
  }
  try {
    const fs = await import("fs/promises");
    await fs.unlink(fullPath);
    return Response.json({ status: "ok", deleted: relativePath });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
