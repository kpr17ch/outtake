import { readdir, stat, mkdir } from "fs/promises";
import { join } from "path";
import { resolveWorkspaceContext } from "@/lib/workspace-context";
import {
  getMimeType,
  resolveWorkspaceEntryPath,
} from "@/lib/workspace-server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("sessionId");
    const workspace = await resolveWorkspaceContext(sessionId);

    if (sessionId && !workspace) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    const rawDir = resolveWorkspaceEntryPath(workspace!.workspacePath, "raw");
    if (!rawDir) {
      return Response.json({ error: "Invalid workspace path" }, { status: 500 });
    }

    await mkdir(rawDir, { recursive: true });

    const entries = await readdir(rawDir);
    const files = [];

    for (const name of entries) {
      if (name.startsWith(".")) continue;
      try {
        const filePath = join(rawDir, name);
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
