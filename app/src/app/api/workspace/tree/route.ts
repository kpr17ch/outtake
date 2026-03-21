import { relative } from "path";
import { readdir, stat } from "fs/promises";
import { resolveWorkspaceContext } from "@/lib/workspace-context";
import {
  getMimeType,
  resolveWorkspaceEntryPath,
} from "@/lib/workspace-server";

export const runtime = "nodejs";

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  modified: string;
  mimeType?: string;
  children?: FileEntry[];
}

async function listDir(
  workspacePath: string,
  dirPath: string
): Promise<FileEntry[]> {
  const normalizedDir = resolveWorkspaceEntryPath(workspacePath, relative(workspacePath, dirPath));
  if (!normalizedDir) {
    return [];
  }

  let entries;
  try {
    entries = await readdir(normalizedDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: FileEntry[] = [];

  for (const entry of entries) {
    // Skip hidden files and node_modules
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

    const fullPath = resolveWorkspaceEntryPath(
      workspacePath,
      relative(workspacePath, normalizedDir) ? `${relative(workspacePath, normalizedDir)}/${entry.name}` : entry.name
    );
    if (!fullPath) {
      continue;
    }

    const relPath = relative(workspacePath, fullPath);

    let fileStat;
    try {
      fileStat = await stat(fullPath);
    } catch {
      continue;
    }

    if (entry.isDirectory()) {
      const children = await listDir(workspacePath, fullPath);
      results.push({
        name: entry.name,
        path: relPath,
        type: "dir",
        size: 0,
        modified: fileStat.mtime.toISOString(),
        children,
      });
    } else if (entry.isFile()) {
      results.push({
        name: entry.name,
        path: relPath,
        type: "file",
        size: fileStat.size,
        modified: fileStat.mtime.toISOString(),
        mimeType: getMimeType(entry.name),
      });
    }
  }

  // Sort: dirs first, then files, alphabetically
  results.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return results;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  const workspace = await resolveWorkspaceContext(sessionId);

  if (sessionId && !workspace) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const tree = await listDir(workspace!.workspacePath, workspace!.workspacePath);
  return Response.json({ workspace: workspace!.workspacePath, tree });
}
