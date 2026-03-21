import { resolve, normalize, relative, extname } from "path";
import { readdir, stat } from "fs/promises";

export const runtime = "nodejs";

const WORKSPACE = resolve(process.cwd(), "../workspace");

const MIME_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".txt": "text/plain",
  ".srt": "text/plain",
  ".md": "text/plain",
};

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  modified: string;
  mimeType?: string;
  children?: FileEntry[];
}

async function listDir(dirPath: string): Promise<FileEntry[]> {
  const normalizedDir = normalize(dirPath);
  if (!normalizedDir.startsWith(WORKSPACE)) {
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

    const fullPath = resolve(normalizedDir, entry.name);
    const relPath = relative(WORKSPACE, fullPath);

    let fileStat;
    try {
      fileStat = await stat(fullPath);
    } catch {
      continue;
    }

    if (entry.isDirectory()) {
      const children = await listDir(fullPath);
      results.push({
        name: entry.name,
        path: relPath,
        type: "dir",
        size: 0,
        modified: fileStat.mtime.toISOString(),
        children,
      });
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      results.push({
        name: entry.name,
        path: relPath,
        type: "file",
        size: fileStat.size,
        modified: fileStat.mtime.toISOString(),
        mimeType: MIME_TYPES[ext] || "application/octet-stream",
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

export async function GET() {
  const tree = await listDir(WORKSPACE);
  return Response.json({ workspace: WORKSPACE, tree });
}
