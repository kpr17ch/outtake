import { readFile, stat } from "fs/promises";
import { join } from "path";
import { type NextRequest } from "next/server";
import { resolveWorkspaceContext } from "@/lib/workspace-context";
import {
  getMimeType,
  resolveWorkspaceEntryPath,
} from "@/lib/workspace-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name");
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!name) {
    return new Response("Missing name parameter", { status: 400 });
  }

  const workspace = await resolveWorkspaceContext(sessionId);
  if (sessionId && !workspace) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const rawDir = resolveWorkspaceEntryPath(workspace!.workspacePath, "raw");
  if (!rawDir) {
    return Response.json({ error: "Invalid workspace path" }, { status: 500 });
  }

  const safeName = name.replace(/[/\\]/g, "");
  const filePath = join(rawDir, safeName);
  if (!resolveWorkspaceEntryPath(rawDir, safeName)) {
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
