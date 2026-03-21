import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { resolveWorkspaceContext } from "@/lib/workspace-context";
import {
  sanitizeUploadedFilename,
  resolveWorkspaceEntryPath,
} from "@/lib/workspace-server";

export const runtime = "nodejs";

const ALLOWED_TYPES = ["video/", "audio/", "image/"];

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    const sessionIdValue = formData.get("sessionId");
    const sessionId =
      typeof sessionIdValue === "string" && sessionIdValue ? sessionIdValue : null;

    if (!files.length) {
      return Response.json({ error: "No files provided" }, { status: 400 });
    }

    const workspace = await resolveWorkspaceContext(sessionId);
    if (sessionId && !workspace) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    const rawDir = resolveWorkspaceEntryPath(workspace!.workspacePath, "raw");
    if (!rawDir) {
      return Response.json({ error: "Invalid workspace path" }, { status: 500 });
    }

    await mkdir(rawDir, { recursive: true });

    const results = [];

    for (const file of files) {
      if (!file.name || file.size === 0) continue;

      const isAllowed = ALLOWED_TYPES.some((t) => file.type.startsWith(t));
      if (!isAllowed) {
        results.push({
          filename: file.name,
          error: `Invalid file type: ${file.type || "unknown"}`,
        });
        continue;
      }

      const safeName = sanitizeUploadedFilename(file.name);
      const filePath = join(rawDir, safeName);

      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(filePath, buffer);

      results.push({
        filename: safeName,
        originalName: file.name,
        path: `raw/${safeName}`,
        size: file.size,
        type: file.type,
      });
    }

    return Response.json({ files: results });
  } catch (err) {
    console.error("[upload] error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
